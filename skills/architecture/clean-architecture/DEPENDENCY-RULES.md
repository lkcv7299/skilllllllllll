# Dependency Rules

How to enforce, check, and fix dependency direction violations in the VozIA runtime. Uses the vocabulary in [LANGUAGE.md](LANGUAGE.md) — **layer**, **Dependency Rule**, **port**, **contract**, **inversion**.

## The Rule

**Source code dependencies point inward only.**

In VozIA `lib/runtime-core/`, the layers from inner to outer are:

| Layer | Directories | May import from |
|-------|-------------|-----------------|
| 1. Entity | `contracts/`, `types/`, `state/` | Nothing outside layer 1 |
| 2. Use Case | `policy/`, `intelligence/` | Layer 1 only |
| 3. Interface Adapter | `parser/`, `gate/`, `response/`, `knowledge/`, `semantic-events/` | Layers 1-2 |
| 4. Mechanism | `nlu/`, `llm/`, `tools/`, `executor/` | Layers 1-3 |

**`utils/`** is layer-neutral — utility functions with no domain knowledge. Any layer may import from `utils/`.

**`context/`** holds runtime context (tenant config, feature flags). Treated as layer 1 — available to all layers.

## Forbidden imports (enforced by depcruise)

These are the active rules in `.dependency-cruiser.cjs`:

### Parser (layer 3 inbound) must not import:
- `policy/` — parser produces parse artifacts, policy consumes gate output
- `response/` — parser cannot depend on response rendering
- `state/` — parser cannot depend on frame state implementation

### Policy (layer 2) must not import:
- `parser/` — gate owns parser-to-policy normalization
- `response/` — policy chooses actions, response realizes them
- `nlu/` — policy cannot call classifier implementation
- `llm/` — policy cannot call LLM parsing/routing implementation
- `tools/`, `executor/` — policy chooses actions, tool execution belongs to executor
- `state/frame-persistence.ts` — policy must not directly access persistence

### Response (layer 3 outbound) must not import:
- `parser/` — response consumes shared turn contracts, not parser-private modules
- `policy/` (except type-only from `policy/model.ts`) — temporary exception with documented migration path
- `nlu/` — response must not call classifier
- `tools/`, `executor/` — response must consume post-tool contracts, not implementation

### State (layer 1) must not import:
- `parser/` — state imports shared contracts, not parser-private types
- `policy/` — state imports shared outcome contracts, not policy implementation
- `response/` — state must not depend on response

### Intelligence (layer 2) must not import:
- `policy/` — intelligence computes signals before policy decisions
- `response/` — intelligence reads response memory through ConversationFrame, not response modules

## How to check

```bash
# Run from vozia-landing/
npm run arch:deps
```

This runs `dependency-cruiser` against `policy/`, `response/`, and `runtime-turn.ts` with the rules above. Zero output means zero violations.

### Reading the output

A violation looks like:

```
error parser-must-not-import-policy: lib/runtime-core/parser/foo.ts → lib/runtime-core/policy/bar.ts
```

This means `parser/foo.ts` has an `import` statement pointing to `policy/bar.ts` — an outward dependency from layer 3 to layer 2. The Dependency Rule says this must not exist.

## How to fix violations

### Pattern 1: Extract a contract (most common)

**Symptom**: module A (inner) imports a type from module B (outer).

**Fix**: Move the type to `contracts/` (layer 1). Both A and B import from `contracts/`. The dependency between A and B is eliminated.

```
BEFORE:  policy/decision.ts imports ResponseMode from response/modes.ts  (layer 2 → layer 3, VIOLATION)
AFTER:   policy/decision.ts imports ResponseMode from contracts/response-authority.ts  (layer 2 → layer 1, OK)
         response/modes.ts  imports ResponseMode from contracts/response-authority.ts  (layer 3 → layer 1, OK)
```

### Pattern 2: Move the function (when it is in the wrong layer)

**Symptom**: module A (inner) imports a utility function from module B (outer), and the function has no outer-layer dependencies itself.

**Fix**: The function is misplaced. Move it to the inner layer or to `utils/`.

```
BEFORE:  policy/workflow.ts imports resolveTime from parser/slot-extractors.ts  (layer 2 → layer 3, VIOLATION)
AFTER:   resolveTime moved to utils/time.ts or to policy/time-resolution.ts  (same layer or layer-neutral, OK)
```

### Pattern 3: Inversion via function parameter (when inner layer needs outer-layer behavior)

**Symptom**: a use case function needs to call an external service (database, LLM, API).

**Fix**: Define a port (function type) in the inner layer. The outer layer provides the implementation at the call site.

```typescript
// contracts/appointment-port.ts (layer 1 — the port)
export type FetchAppointments = (businessId: string, date: string) => Promise<Appointment[]>;

// policy/booking.ts (layer 2 — consumes the port)
export function evaluateBooking(input: ValidatedPolicyInput, fetchAppointments: FetchAppointments) {
  // uses fetchAppointments without knowing it talks to Supabase
}

// runtime-turn.ts (orchestrator — wires the layers)
import { evaluateBooking } from './policy/booking';
import { supabaseFetchAppointments } from './tools/appointments';
evaluateBooking(input, supabaseFetchAppointments);
```

The source dependency in `policy/booking.ts` points to `contracts/` (inward). The runtime wiring happens in the orchestrator, which sits outside both layers.

### Pattern 4: Gate transformation (when policy needs parsed data)

**Symptom**: policy imports parser types to read parsed output.

**Fix**: This is what `gate/` exists for. The gate transforms parser output into `ValidatedPolicyInput` — a contract that policy can consume without importing parser internals.

```
BEFORE:  policy/decision.ts imports TurnPlan from parser/contracts.ts  (layer 2 → layer 3)
AFTER:   gate/validated-policy-input.ts reads TurnPlan + state → produces ValidatedPolicyInput
         policy/decision.ts imports ValidatedPolicyInput from contracts/validation-gate.ts  (layer 2 → layer 1, OK)
```

The gate is an inbound interface adapter — its entire purpose is to shield policy from parser implementation details.

## Baseline violations

Some violations are temporarily tolerated during migration. These are recorded in `.dependency-cruiser-baseline.json` with:
- The exact `from` and `to` paths
- The rule being violated
- A comment explaining the migration plan

Current baseline (1 violation):
- `response/response-strategy.ts` → `tools/post-tool-reducer.ts`: value import of `nextRequiredSlotPromptForReducer`. Needs function relocation to `contracts/` or `utils/`. Tracked for cleanup.

**Rules for baseline entries**:
- Every entry must have a `comment` with a migration plan
- Baseline entries are not permanent — review and remove them as migrations complete
- Never add a baseline entry without first attempting patterns 1-4 above
- If a baseline grows beyond 5 entries, the architecture has a structural problem — stop and redesign

## Testing strategy

Dependency enforcement is a build-time check, not a runtime test. But testing discipline reinforces the Dependency Rule:

- **Entity tests** (`contracts/`, `types/`, `state/`): pure unit tests, no mocks, no I/O. If an entity test needs a mock, the entity has a hidden dependency on an outer layer.
- **Use case tests** (`policy/`, `intelligence/`): test through the function's interface. External dependencies are passed as function arguments (ports). Tests provide in-memory implementations. If a use case test imports from `parser/` or `response/`, the test is violating the same boundary the code should respect.
- **Adapter tests** (`parser/`, `gate/`, `response/`): test the translation. Input is raw external format, output is the contract type. These tests may be heavier (parsing real utterances, rendering real templates).
- **Mechanism tests** (`tools/`, `executor/`, `nlu/`, `llm/`): integration tests that may hit real services or local substitutes (PGLite, mock LLM). These are the slowest and most brittle — which is exactly why policy must not depend on them.

**Golden tests** (promptfoo) exercise the full stack end-to-end. They cross all layers and catch integration failures. But they do not replace layer-specific tests — a golden test failure in 68 flows is much harder to diagnose than a policy unit test failure.

## Adding a new module

When creating a new file or directory in `runtime-core/`:

1. **Classify its layer** using the questions in [SKILL.md](SKILL.md) step 1
2. **Place it in the correct directory** for that layer
3. **Check all imports** — every import must point to the same or inner layer
4. **Run `npm run arch:deps`** — verify zero new violations
5. **If the module needs a new forbidden rule**, add it to `.dependency-cruiser.cjs` proactively. The rule set should grow as the codebase grows — missing rules are silent violations waiting to happen
