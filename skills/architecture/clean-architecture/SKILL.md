---
name: clean-architecture
description: Enforce and evolve Clean Architecture dependency rules in a functional TypeScript codebase. Use when checking import boundaries, proposing layer changes, onboarding new modules, or diagnosing coupling violations in the VozIA runtime.
---

# Clean Architecture

Enforce the **Dependency Rule** across the VozIA runtime layers. Every import must point inward — from mechanisms toward policies. Violations are caught by `depcruise`, but understanding *why* a dependency is wrong matters more than the tooling error.

## Glossary

Use these terms exactly. Full definitions in [LANGUAGE.md](LANGUAGE.md).

- **Layer** — a concentric ring in the architecture. Inner layers hold policy; outer layers hold mechanism.
- **Dependency Rule** — source code dependencies point inward only. An inner layer never imports from an outer layer.
- **Entity** — enterprise-wide business rules that exist independent of any application. In VozIA: the conversation state machine types, obligation types, workflow kinds.
- **Use Case** — application-specific orchestration that directs entities. In VozIA: policy decision functions, gate computations, workflow resolvers.
- **Interface Adapter** — translates between use case contracts and external formats. In VozIA: parser/normalizer (inbound), response realizer/templates (outbound), gate views (inbound translation for policy).
- **Mechanism** — frameworks, drivers, I/O, third-party SDKs. In VozIA: LLM clients, BETO classifier, Supabase, TTS providers, WhatsApp transport.
- **Port** — an interface defined by an inner layer that an outer layer implements. The inner layer declares what it needs; the outer layer provides it.
- **Contract** — a shared type definition that crosses layer boundaries without creating a dependency. Lives in `contracts/` or `types/`.

See [DEPENDENCY-RULES.md](DEPENDENCY-RULES.md) for the enforcement rules and how to fix violations.

## VozIA Layer Map

From innermost (purest policy) to outermost (most impure mechanism):

```
┌─────────────────────────────────────────────────┐
│  4. Mechanisms (outermost)                      │
│     nlu/ llm/ tools/ executor/                  │
│     Supabase, LLM clients, BETO, TTS, WhatsApp  │
├─────────────────────────────────────────────────┤
│  3. Interface Adapters                          │
│     parser/ → inbound adapter                   │
│     response/ → outbound adapter                │
│     gate/ → inbound translation for policy      │
│     knowledge/ → data access adapter            │
├─────────────────────────────────────────────────┤
│  2. Use Cases                                   │
│     policy/ → decision orchestration            │
│     intelligence/ → signal computation          │
├─────────────────────────────────────────────────┤
│  1. Entities (innermost)                        │
│     contracts/ → shared business rule types     │
│     types/ → domain primitives                  │
│     state/ → conversation frame schema          │
└─────────────────────────────────────────────────┘
```

**Allowed dependency direction**: 4 may import 3, 3 may import 2, 2 may import 1. Never the reverse.

**Cross-layer data**: flows through contracts defined at the inner layer. `contracts/` types are the ports. Outer layers produce data conforming to these types; inner layers consume them without knowing who produced them.

## Process

### 1. Classify the module

Before writing or modifying any module, determine which layer it belongs to. Ask:

- Does it contain business rules that would exist even without this application? → **Entity** (layer 1)
- Does it orchestrate entities to fulfill an application-specific goal? → **Use Case** (layer 2)
- Does it translate between external formats and use case contracts? → **Interface Adapter** (layer 3)
- Does it perform I/O, call third-party SDKs, or handle transport? → **Mechanism** (layer 4)

If a module spans two layers, it needs splitting. The most common violation: a use case module that also does I/O (policy function that calls Supabase directly).

### 2. Check imports against the Dependency Rule

Every `import` statement in the module must point to the same layer or an inner layer. Never to an outer layer.

Concrete checks for VozIA:
- `policy/` must NOT import from `parser/`, `response/`, `nlu/`, `llm/`, `tools/`, `executor/`
- `parser/` must NOT import from `policy/`, `response/`, `state/`
- `response/` must NOT import from `parser/`, `policy/` (except type-only from `policy/model.ts`), `nlu/`, `tools/`, `executor/`
- `intelligence/` must NOT import from `policy/`, `response/`
- `state/` must NOT import from `parser/`, `policy/`, `response/`

Run `npm run arch:deps` to verify. See [DEPENDENCY-RULES.md](DEPENDENCY-RULES.md) for the full rule set and fixing procedures.

### 3. Design data flow across layers

Data crosses layers through **contracts**, not through direct imports of producing modules.

Pattern for inbound data (user input to policy):
1. **Mechanism** (WhatsApp/LiveKit) receives raw input
2. **Interface Adapter** (`parser/`) normalizes to `TurnPlan` contract
3. **Interface Adapter** (`gate/`) transforms `TurnPlan` + frame state into `ValidatedPolicyInput`
4. **Use Case** (`policy/`) consumes `ValidatedPolicyInput` — never touches parser output directly

Pattern for outbound data (policy decision to user response):
1. **Use Case** (`policy/`) produces `PolicyDecision` with act plan
2. **Interface Adapter** (`response/`) realizes the decision into natural language
3. **Mechanism** (WhatsApp/LiveKit) delivers the response

When adding a new data path, define the contract type in `contracts/` first. Then implement producers (outer) and consumers (inner) independently.

### 4. Evaluate new seams

When a dependency violation exists and cannot be removed by reordering imports, you need a new seam. Apply the seam test from [LANGUAGE.md](LANGUAGE.md):

- Will this seam have at least two adapters (production + test)? If not, it is premature abstraction.
- Does the inner layer define the port, and the outer layer implement it? If the outer layer defines the interface, the dependency points the wrong way.
- Can the port be expressed as a plain function signature or a type, not a class hierarchy? In functional TypeScript, ports are function types passed as arguments, not abstract classes.

### 5. Verify with depcruise

After any structural change:

```bash
npm run arch:deps
```

If violations appear in the output, fix them before committing. If a violation is a known temporary exception, add it to `.dependency-cruiser-baseline.json` with a comment explaining the migration plan and target session.

Never suppress a violation without a documented plan to remove it.
