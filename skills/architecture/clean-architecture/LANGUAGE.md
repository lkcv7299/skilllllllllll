# Language

Shared vocabulary for Clean Architecture enforcement in the VozIA runtime. Use these terms exactly in every analysis, suggestion, and violation report. Full process in [SKILL.md](SKILL.md), enforcement rules in [DEPENDENCY-RULES.md](DEPENDENCY-RULES.md).

## Terms

**Layer**
A concentric ring in the architecture. Inner layers hold stable, abstract policy. Outer layers hold volatile, concrete mechanism. The number of layers is not fixed — what matters is the direction of dependencies between them.
_Avoid_: tier (implies deployment), level (ambiguous direction).

**Dependency Rule**
The single overriding constraint: source code dependencies point inward only. Nothing in an inner layer may name, import, or reference anything in an outer layer. Data can flow outward (a policy decision reaches the response layer), but the source code dependency that enables that flow must point inward (response imports the contract type defined by policy, not the reverse).
_Avoid_: calling it a "guideline" or "best practice" — it is a hard rule enforced by tooling.

**Entity**
Business rules that would exist even if no application existed. In VozIA: the types in `contracts/` and `types/` — obligation kinds, workflow states, semantic patches, appointment schemas. Entities have no knowledge of use cases, adapters, or mechanisms.
_Avoid_: model (overloaded with ML model, data model), domain object (implies OOP).

**Use Case**
Application-specific orchestration. Directs entities to achieve a concrete goal. In VozIA: policy decision functions that read gate views and produce policy decisions, intelligence signal computations. A use case knows about entities but not about how input arrives or how output is rendered.
_Avoid_: service (overloaded), handler (implies framework coupling), controller (that is an adapter concept).

**Interface Adapter**
Translates between the format convenient for use cases and the format convenient for an external mechanism. Two directions:
- **Inbound adapter**: converts external input into use case contracts. VozIA: `parser/` (raw text to `TurnPlan`), `gate/` (`TurnPlan` + state to `ValidatedPolicyInput`).
- **Outbound adapter**: converts use case output into external format. VozIA: `response/` (policy decision to natural language), `knowledge/` (business data to KB responses).
_Avoid_: middleware (implies linear chain), transformer (too generic).

**Mechanism**
Frameworks, drivers, I/O, and third-party integrations. The outermost layer. In VozIA: LLM client calls (`llm/`), BETO classifier (`nlu/`), tool execution (`tools/`, `executor/`), Supabase queries, WhatsApp/LiveKit transport. Mechanisms are the most volatile layer — they change when vendors change, when SDKs update, when infrastructure shifts. Policy must never depend on them.
_Avoid_: infrastructure (ambiguous — could mean CI/CD), external (everything outside the innermost layer is "external").

**Port**
An interface defined by an inner layer, implemented by an outer layer. The inner layer declares *what* it needs without knowing *who* provides it. In functional TypeScript, a port is typically a function type or a record of function types, passed as an argument — not an abstract class.
_Avoid_: interface (collides with this skill's broader definition from the architecture-improvement skill), abstraction (too vague).

**Contract**
A shared type definition that enables data to cross layer boundaries without creating a source code dependency from inner to outer. In VozIA: the types in `contracts/` — `ValidatedPolicyInput`, `PolicyDecision`, `ObligationArbitration`, `ResponseAuthority`. Contracts are owned by the innermost layer that needs them.
_Avoid_: DTO (implies serialization concern), schema (implies validation concern).

**Inversion**
The technique of making an outer layer depend on an inner layer's port, rather than the inner layer depending on the outer layer's implementation. In procedural terms: instead of the policy function importing the Supabase client, the policy function accepts a `fetchAppointments: (id: string) => Promise<Appointment[]>` parameter, and the orchestrator injects the Supabase-backed implementation at the call site.
_Avoid_: DI, dependency injection (implies a container/framework — here it is just function arguments).

**Crossing Boundary**
When data moves from one layer to another. Data structures that cross boundaries must conform to contracts defined by the inner layer. The outer layer must not force the inner layer to know about outer-layer types. In VozIA: `gate/` transforms parser output into `ValidatedPolicyInput` precisely because policy must not import parser types.
_Avoid_: data transfer (implies serialization), message passing (implies async).

## Principles

- **Source dependencies inward, data flow in any direction.** The distinction matters. A policy decision flows outward to response, but `response/` imports the contract type from `contracts/`, not from `policy/`. The dependency points inward even when the data flows outward.
- **Ports are owned by the consumer, not the provider.** The inner layer defines what it needs. The outer layer conforms to that definition. If the provider defines the interface, the dependency points outward — a violation.
- **Function arguments are ports.** In functional TypeScript without a DI container, dependency inversion happens through function parameters. A policy function that needs external data declares the shape of that data as a parameter type. The caller (orchestrator, in an outer layer) provides the concrete implementation.
- **Contracts live at the innermost layer that needs them.** If both policy and response need a type, it belongs in `contracts/` (entity layer), not in either consuming layer.
- **Two adapters justify a seam. One adapter is indirection.** Do not introduce a port unless at least two concrete implementations exist (typically production + test). A single implementation behind an interface adds complexity without benefit.

## Relationships

- A **Layer** contains modules. Modules within the same layer may import each other freely.
- The **Dependency Rule** governs imports between **Layers**: always inward.
- **Entities** are the innermost layer. **Use Cases** depend on entities. **Interface Adapters** depend on use cases and entities. **Mechanisms** depend on everything.
- A **Port** is defined by an inner **Layer** and implemented by an outer **Layer** — this is **Inversion**.
- A **Contract** enables **Crossing Boundary** without violating the **Dependency Rule**.

## Rejected framings

- **Clean Architecture as class-based patterns (abstract classes, inheritance hierarchies)**: irrelevant in functional TypeScript. Ports are function types, entities are plain types, use cases are functions.
- **Layers as physical deployment tiers (frontend/backend/database)**: layers are source code dependency groups, not deployment units. All VozIA runtime layers run in the same Node.js process.
- **The Dependency Rule as "inner layers are more important"**: inner layers are more *stable* (change less often), not more important. A broken mechanism (LLM client down) is just as critical as a broken policy — but the policy source code should not need to change when the LLM client API changes.
- **Strict four-layer model**: Clean Architecture prescribes at minimum four rings, but the number is flexible. VozIA has sub-layers within adapters (parser vs gate vs response). The rule is the direction, not the count.
