# Language

Shared vocabulary for Domain-Driven Design as applied to this codebase. Use these terms exactly when analyzing, designing, or refactoring domain boundaries. Consistent language is the whole point.

Cross-reference: [SKILL.md](SKILL.md) uses these terms in its process steps. [BOUNDED-CONTEXTS.md](BOUNDED-CONTEXTS.md) uses them to identify and enforce context boundaries.

## Terms

**Ubiquitous Language**
The shared vocabulary a team uses for concepts in a specific bounded context. Code names, variable names, function names, and conversation about the system all use the same words. When the code says `Obligation` and the team says "obligation," no translation is needed. When someone says "the thing the user wants" and the code says `TurnPlanObligation`, the language is not ubiquitous -- fix the code or fix the conversation.
_Avoid_: jargon, glossary (too passive -- ubiquitous language is enforced, not documented and ignored).

**Bounded Context**
A region of the codebase where a specific ubiquitous language applies without ambiguity. Inside a bounded context, every term has exactly one meaning. The same word can mean different things in different contexts -- `intent` means BETO's raw classification in NLU, but means a normalized `PrimaryIntent` in Gate. That is fine, as long as each context is internally consistent.
_Avoid_: module, service, layer (too implementation-flavored -- a bounded context is about meaning, not packaging).

**Context Boundary**
The explicit barrier where one bounded context ends and another begins. Data crossing this boundary must be translated. In this runtime: the Gate is the context boundary between NLU and Policy. Policy never reads raw parser output; it reads `ValidatedPolicyInput`.
_Avoid_: seam (reserved for the architecture skill -- seams are about interface leverage; context boundaries are about meaning translation).

**Anti-Corruption Layer (ACL)**
A translation module that sits at a context boundary and prevents one context's concepts from leaking into another. The ACL owns the mapping: it takes the upstream context's output and produces the downstream context's input. In this runtime: `validated-policy-input.ts` and the `gate/*.ts` modules are the ACL between NLU and Policy. They translate parser signals (`DMIntent`, `BioSpan`, raw entities) into policy-safe concepts (`SurfaceActs`, `BookingSlots`, `InquiryRequest`).
_Avoid_: adapter (adapters satisfy an interface at a seam; an ACL translates meaning between contexts -- related but distinct concerns).

**Aggregate**
A cluster of domain objects treated as a single unit for state changes. One object in the cluster is the **aggregate root** -- all mutations go through it. External code holds a reference to the root, never to internals. In this runtime: `ConversationFrame` is the aggregate root for conversation state. Nothing writes to `entities`, `workflow`, `commitment`, or `constraint_ledger` directly -- all writes go through `FramePatchPlan` which is applied to the Frame as a unit.
_Avoid_: state object, store (too generic -- aggregate implies transactional consistency and a guarded root).

**Aggregate Root**
The single entry point for all mutations to an aggregate. Enforces invariants before accepting changes. If the root does not approve, the mutation does not happen. `ConversationFrame` is the root; `FramePatchPlan` is the mechanism for proposing changes to it.
_Avoid_: top-level state, main object.

**Domain Event**
A record that something meaningful happened in the domain. Not a technical event (HTTP request, database write) -- a domain event captures business meaning: "appointment was booked," "user denied confirmation," "availability expired." Domain events are past-tense facts. In this runtime: `mutation_ledger` entries, `constraint_ledger` entries, and `progress_memory` records function as domain events -- they capture what happened and prevent the system from repeating or contradicting itself.
_Avoid_: log entry, callback, side effect (domain events are first-class facts, not implementation details).

**Value Object**
An immutable object defined entirely by its attributes, with no identity beyond its contents. Two value objects with the same attributes are equal. In this runtime: `BookingSlots`, `InquiryRequest`, `SurfaceActs`, `ModificationChanges` are value objects -- they are computed fresh each turn, compared by content, and never mutated in place.
_Avoid_: DTO, data class (value objects carry domain meaning and can have behavior; DTOs are just transport containers).

**Entity**
An object with a persistent identity that survives state changes. Two entities can have identical attributes but are still different if their identities differ. In this runtime: a conversation is an entity (identified by conversation ID), an appointment is an entity (identified by appointment ID). The `ConversationFrame` tracks entity identity through `active_quote`, `selected_appointment`, `appointment_id`.
_Avoid_: record, row (entities live in the domain model, not the database).

**Invariant**
A rule that must always be true within an aggregate, enforced by the aggregate root. Violations are programming errors, not user errors. In this runtime: "Policy reads only ValidatedPolicyInput, never raw parser output" is Invariant #2. "Mutation requires valid commitment" is an invariant of the Frame aggregate. The `ResponseValidator` enforces the invariant "never claim what you cannot ground."
_Avoid_: validation rule, business rule (invariants are structural guarantees, not user-facing checks).

**Repository**
The interface through which the domain retrieves and persists aggregates. Hides storage mechanics. The domain asks for a `ConversationFrame` by conversation ID; the repository handles Supabase, caching, serialization. Domain code never mentions storage technology.
_Avoid_: data access layer, DAO (repository is a domain concept, not an infrastructure pattern).

## Relationships

- A **Bounded Context** has exactly one **Ubiquitous Language** that is internally consistent.
- A **Context Boundary** separates two **Bounded Contexts**. Data crosses it only through an **Anti-Corruption Layer**.
- An **Aggregate** lives entirely within one **Bounded Context**. It never spans two contexts.
- An **Aggregate Root** enforces **Invariants** for the entire aggregate.
- **Domain Events** are produced by **Aggregates** when state changes. They can cross **Context Boundaries** (unlike raw domain objects).
- **Value Objects** are immutable. **Entities** have identity. Both live inside **Aggregates**.
- **Repositories** retrieve and persist **Aggregates** by the **Aggregate Root**'s identity.

## Rejected framings

- **DDD as enterprise architecture**: DDD is about modeling complexity within a codebase. Ignore strategic patterns (partnership, shared kernel, customer-supplier) unless managing multiple teams or services. This runtime is one team, one deployment.
- **Bounded context = microservice**: A bounded context is a linguistic boundary, not a deployment boundary. This runtime has multiple bounded contexts in one TypeScript process.
- **Aggregate = database table**: Aggregates are consistency boundaries, not storage schemas. `ConversationFrame` spans many database columns but is one aggregate.
- **Domain event = pub/sub message**: Domain events can be implemented as pub/sub, but the concept is "something important happened in the domain" -- not "I published to a queue." In this runtime they are ledger entries, not messages.
- **Anti-corruption layer = API gateway**: An ACL translates meaning, not protocols. The Gate translates `DMIntent.book_appointment` into `routeIntent: booking` -- same protocol (TypeScript function call), different meaning.
