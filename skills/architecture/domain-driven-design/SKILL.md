---
name: domain-driven-design
description: Analyze and enforce domain boundaries in the voice AI runtime using DDD tactical patterns. Use when refactoring across contexts, when a term means different things in different modules, when state changes leak across boundaries, or when adding a new domain concept.
---

# Domain-Driven Design

Identify bounded contexts, enforce context boundaries, and align code structure with domain meaning. The aim is that each region of the codebase has one unambiguous language and communicates with other regions only through explicit translation.

## Glossary

Use these terms exactly in every analysis. Consistent language is the point -- do not drift into "component," "service," "API," or "layer." Full definitions in [LANGUAGE.md](LANGUAGE.md).

- **Ubiquitous Language** -- the shared vocabulary within a bounded context. Code and conversation use the same words.
- **Bounded Context** -- a region where every term has exactly one meaning.
- **Context Boundary** -- where one context ends and another begins. Data crosses only through translation.
- **Anti-Corruption Layer (ACL)** -- a translation module at a context boundary that prevents upstream concepts from leaking downstream.
- **Aggregate** -- a cluster of domain objects mutated as a unit through a single root.
- **Domain Event** -- a past-tense fact recording something meaningful that happened.
- **Value Object** -- immutable, identity-free, compared by content.
- **Invariant** -- a rule that must always hold within an aggregate.

Key principles (see [LANGUAGE.md](LANGUAGE.md) for the full list):

- **Language divergence test**: if the same word means different things in two files, those files belong to different bounded contexts.
- **Translation test**: if data flows between two modules and requires field renaming, type narrowing, or semantic reinterpretation, there is a context boundary -- make the ACL explicit.
- **Aggregate boundary test**: if two objects must change together atomically, they belong in the same aggregate. If they can change independently, they do not.

This skill is _complementary_ to the [architecture skill](../improve-codebase-architecture/SKILL.md). That skill deepens modules; this skill enforces that modules in different contexts do not share language or leak state. See also [BOUNDED-CONTEXTS.md](BOUNDED-CONTEXTS.md) for context identification and enforcement.

## The five bounded contexts of this runtime

These are the natural contexts identified in `runtime-core/`. Each has its own ubiquitous language:

1. **NLU** (`nlu/`, `parser/`): Raw interpretation. Language: `DMIntent`, `BioSpan`, `tokenList`, `segmenter`, `slot-extractors`. Concepts: classification confidence, entity extraction, speech acts.
2. **Gate** (`gate/`, `contracts/validation-gate.ts`): Translation layer. Language: `SurfaceActs`, `BookingSlots`, `InquiryRequest`, `ValidatedPolicyInput`, `WorkflowResolution`. This IS the ACL between NLU and Policy.
3. **Policy** (`policy/`, `policy/machines/`, `policy/analysis/`): State machines and decisions. Language: `PolicyDecision`, `Transition`, `stage`, `commitment`, `MutationCommitDecision`, `booking-progress`. Policy reads ONLY `ValidatedPolicyInput` (Invariant #2).
4. **Response** (`response/`, `contracts/response-authority.ts`): What the system is allowed to say. Language: `ResponseScene`, `ActPlan`, `ResponseAct`, `ToolGrounding`, `ResponseClaim`, `ForbiddenFact`. Concerned with authority and evidence, not domain logic.
5. **Knowledge Base** (`knowledge/`, `tools/`): External data retrieval. Language: `cards`, `token-match`, `resolve-business-knowledge`, `post-tool-reducer`. Provides grounding evidence to Response.

## Process

### 1. Map the current language

Before changing anything, inventory the terms used in the area you are touching.

For each module in scope:
- List the domain terms it uses (types, function names, variable names).
- Note where the same word appears with different meanings across modules.
- Check whether the module's terms match one of the five contexts above, or whether it mixes languages from multiple contexts.

The output is a language map: which terms belong to which context, and where terms are ambiguous or leaking.

### 2. Identify context boundaries

Using the language map, locate where context boundaries exist or should exist. Apply the tests from [BOUNDED-CONTEXTS.md](BOUNDED-CONTEXTS.md):

- **Language divergence**: same word, different meaning = different context.
- **Translation**: data requires semantic reinterpretation to cross = boundary exists.
- **Invariant locality**: invariants that span two modules = either they belong in the same aggregate, or the boundary is leaking.

Check whether each boundary has an explicit ACL. The Gate/Policy boundary is the model: `gate/*.ts` translates NLU output into `ValidatedPolicyInput`. Other boundaries may lack this discipline.

### 3. Audit boundary enforcement

For each identified boundary, check:

1. **Import discipline**: Does downstream code import upstream types directly? If Policy imports `DMIntent` or `BioSpan`, the boundary is violated.
2. **Type-level enforcement**: Is the ACL output a distinct type that cannot be confused with the upstream type? `ValidatedPolicyInput` is distinct from `TurnPlan` -- good. If upstream and downstream share a type, the boundary is nominal, not real.
3. **Aggregate integrity**: Do state changes respect aggregate boundaries? If Response modifies `ConversationFrame` directly instead of going through the Frame aggregate root, the aggregate boundary is violated.
4. **Domain event discipline**: When state changes in one context need to be visible in another, is the communication through domain events (ledger entries, facts) rather than shared mutable state?

Present violations as a numbered list. For each violation:
- **Location**: file(s) where the violation occurs.
- **Violation**: what boundary is being crossed and how.
- **Impact**: what bugs this causes or could cause (ground in actual bugs from the tracker when possible).
- **Fix**: how to restore the boundary.

### 4. Propose corrections

For each violation, propose a correction. Corrections fall into categories:

- **Extract ACL**: create a translation module where none exists. Model after `gate/*.ts`.
- **Narrow types**: replace a shared type with context-specific value objects on each side of the boundary.
- **Move module**: a module uses language from context A but lives in context B's directory. Move it.
- **Enforce aggregate root**: route mutations through the aggregate root instead of modifying internals directly.
- **Introduce domain event**: replace cross-context shared mutable state with a past-tense fact record.

Do NOT propose corrections yet. Ask the user: "Which violations would you like to fix?"

Then work with the user on each fix, following the same grilling loop as the [architecture skill](../improve-codebase-architecture/SKILL.md).

## When to use this skill

- A term means different things in different files and bugs arise from the confusion (e.g., `intent` meaning raw BETO output vs. normalized policy input).
- State changes in one module cause unexpected behavior in another module that should be independent.
- A refactoring requires touching files across multiple directories because concepts leak across boundaries.
- Adding a new domain concept (e.g., a new workflow kind) and you need to know which contexts it touches and what translations are needed.
- After the architecture skill identifies a deepening opportunity that crosses context boundaries.

## When NOT to use this skill

- Pure implementation refactoring within a single context (use the architecture skill instead).
- Infrastructure changes (database, deployment, CI) that do not touch domain concepts.
- Adding tests for existing behavior without changing domain boundaries.
