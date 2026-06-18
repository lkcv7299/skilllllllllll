# Bounded Contexts

How to identify bounded contexts, enforce their boundaries, and test that boundaries hold. Uses the vocabulary from [LANGUAGE.md](LANGUAGE.md) and complements the process in [SKILL.md](SKILL.md).

## Identifying bounded contexts

A bounded context is not a folder or a module -- it is a region where terms are unambiguous. Three tests reveal where contexts exist:

### Language divergence test

Pick a term that appears in multiple files. Read how each file uses it. If the meaning differs, those files belong to different bounded contexts.

**Example in this runtime**: `intent`
- In `nlu/beto-classify.ts`: `DMIntent` -- a raw classifier label with confidence score. Meaning: "BETO thinks the utterance is about X with probability Y."
- In `parser/normalizer.ts`: `PrimaryIntent` -- a normalized category. Meaning: "after applying rules, the utterance's primary purpose is X."
- In `gate/workflow-resolver.ts`: `routeIntent` -- a workflow routing decision. Meaning: "the turn should be handled by the X workflow."

Three different meanings, three different contexts. The normalizer sits at the boundary between NLU and Gate. The workflow resolver sits inside Gate.

**Procedure**: grep for a suspect term across `runtime-core/`. Group usages by meaning. Each meaning-group is a context candidate.

### Translation test

Trace data flow between two modules. If the data requires field renaming, type narrowing, semantic reinterpretation, or lossy compression to cross, a context boundary exists.

**Example in this runtime**: NLU to Policy
- NLU produces: `TurnPlan` with `obligations[]`, `entities`, `bioSpans`, raw `DMIntent`, slot extraction results.
- Policy receives: `ValidatedPolicyInput` with `surfaceActs`, `bookingSlots`, `inquiryRequest`, `modificationChanges`, `workflowResolution`.
- Translation: `gate/*.ts` modules perform the mapping. `DMIntent.book_appointment` becomes `routeIntent: booking`. Raw date strings become structured `BookingSlots`. This is not renaming -- it is semantic reinterpretation.

If the translation is happening inline (scattered across the downstream module), the ACL is missing. If it is concentrated in one place, the ACL exists.

### Invariant locality test

List the invariants each module enforces. If an invariant spans two modules, either:
1. The modules belong in the same aggregate (merge them), or
2. The boundary between them is leaking (fix the ACL).

**Example in this runtime**: "mutation requires valid commitment"
- `policy/analysis/mutation-commit.ts` checks commitment validity.
- `executor/pre-tool-gate.ts` checks mutation safety.
- Both enforce aspects of the same invariant. They belong to different contexts (Policy vs. Execution), but the invariant is properly split: Policy decides IF mutation is allowed, PreToolGate enforces HOW (no duplicates, no dangerous repeats). Each side enforces its own half. The boundary is clean.

**Counter-example**: if `response-strategy.ts` (Response context) checked commitment state directly from `ConversationFrame` instead of receiving it through `ResponseScene`, the invariant would leak across the Policy/Response boundary.

## Enforcing context boundaries

Once you have identified where boundaries are, enforce them mechanically. Instructions beat conventions.

### Type-level enforcement

The strongest boundary enforcement is making it impossible to pass the wrong type.

**Pattern (from this runtime)**:
```
NLU produces:  TurnPlan           (NLU-context type)
Gate consumes:  TurnPlan           (reads upstream type)
Gate produces:  ValidatedPolicyInput  (Gate-context type, DIFFERENT type)
Policy consumes: ValidatedPolicyInput  (reads only this type)
```

Policy functions take `ValidatedPolicyInput` as a parameter type. They cannot accidentally receive a `TurnPlan` because TypeScript's structural typing would reject the mismatch. The ACL (`gate/*.ts`) is the only code that knows both types.

**Anti-pattern**: using `any`, union types, or a shared base type that both contexts extend. This defeats the type boundary.

**Rule**: each side of a context boundary should have its own type. The ACL is the only module that imports both.

### Import rules

Within a bounded context, modules freely import each other. Across a context boundary, imports follow a strict direction:

```
NLU --> Gate --> Policy --> Response
              |
              v
         Knowledge Base
```

Downstream contexts never import upstream types directly. Policy does not import `DMIntent`. Response does not import `BookingSlots`. If a downstream module needs upstream information, the ACL translates it into a downstream value object first.

**How to check**: grep for imports that cross boundaries. In this runtime:
- Policy files (`policy/**`) should not import from `parser/**` or `nlu/**`.
- Response files (`response/**`) should not import from `gate/**` or `parser/**`.
- Knowledge files (`knowledge/**`) should not import from `policy/**`.

Violations indicate a leaking boundary.

### ACL discipline

An ACL must be:

1. **Explicit**: a distinct module or set of modules, not logic scattered across the downstream consumer.
2. **Complete**: every piece of upstream data the downstream context needs passes through the ACL. No side-channels.
3. **Owned by the downstream context**: the ACL speaks the downstream language. `gate/*.ts` produces `ValidatedPolicyInput` (Policy's language), not `ParsedTurnData` (NLU's language).
4. **Tested independently**: the ACL has its own tests that verify translation correctness. Test that `DMIntent.book_appointment` during a cancellation workflow produces the correct `WorkflowResolution`, not just that "the gate works."

**Model ACL in this runtime**: `gate/validated-policy-input.ts` + `gate/surface-acts.ts` + `gate/booking-slots.ts` + `gate/workflow-resolver.ts` + `gate/inquiry-request.ts` + `gate/modification-changes.ts` + `gate/delivery-intent.ts` + `gate/loop-evidence.ts`.

Each gate module translates one aspect of the NLU output into one policy-safe value object. Together they compose `ValidatedPolicyInput`. Policy code only sees the composed result.

### Aggregate boundaries within a context

Within a single bounded context, aggregates provide a second level of boundary enforcement:

1. **All mutations go through the aggregate root.** `ConversationFrame` is modified only through `FramePatchPlan`. No module reaches into `frame.entities.requested_date` and overwrites it directly.
2. **Invariants are checked at the root.** The root rejects invalid patches before they are applied.
3. **References to aggregates are by identity, not by embedding.** Other contexts reference a conversation by ID, not by holding a pointer to the Frame object.

## Testing boundary integrity

### Boundary crossing tests

For each ACL, write tests that verify:

1. **Complete translation**: every field the downstream context needs is populated. A missing field means the ACL is incomplete.
2. **No leakage**: the output type contains no upstream-specific concepts. If `ValidatedPolicyInput` contained a `bioSpans` field, NLU concepts would leak into Policy.
3. **Edge case translation**: upstream edge cases (null confidence, empty entities, conflicting intents) produce well-defined downstream values, not `undefined` or pass-throughs.

### Invariant tests

For each aggregate, write tests that verify:

1. **Root enforcement**: mutations attempted without going through the root fail or are blocked.
2. **Consistency after mutation**: after applying a `FramePatchPlan`, all invariants hold (e.g., if `requested_date` changed, `active_quote` is invalidated).
3. **Domain event production**: each meaningful state change produces the appropriate ledger entry.

### Regression tests for boundary violations

When a bug is caused by a boundary violation (upstream concept leaking downstream, aggregate modified without going through root), the fix should include:

1. A test that reproduces the boundary violation.
2. The structural fix (type change, ACL extraction, import restriction).
3. A test that verifies the boundary holds under the conditions that caused the original violation.

This prevents future refactoring from reintroducing the same leak.

## Common boundary violations in voice AI runtimes

These are patterns that frequently indicate leaking boundaries. Check for them during any DDD audit:

1. **Raw classifier output in policy logic**: Policy code reading `DMIntent` or classifier confidence directly instead of receiving a policy-level routing decision through the ACL. Fix: add the missing translation to the Gate.

2. **Response module reading conversation state directly**: Response code accessing `ConversationFrame` fields to decide what to say, bypassing `ResponseScene` / `ResponseAuthority`. Fix: extend the Response ACL (`response-scene.ts`) to include the needed information.

3. **Tool reducer modifying policy state**: `post-tool-reducer.ts` writing to fields that Policy owns (workflow stage, commitment state) instead of producing domain events that Policy reads. Fix: reducer produces facts/events; Policy interprets them on the next turn.

4. **Knowledge base importing policy types**: KB modules that import workflow-specific types to decide how to answer. Fix: KB receives a context-free query; the ACL at the Policy/KB boundary translates policy context into a query the KB understands.

5. **Cross-context invariant enforcement**: An invariant checked in both Policy and Response with duplicated logic. Fix: the invariant belongs to one context. The other context receives the result of the check through the boundary, not the check logic itself.
