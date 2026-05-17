---
name: trd
description: Use this skill whenever producing a Technical Requirements Document (TRD), design document, or technical spec. Triggers include any mention of "TRD", "technical requirements document", "design doc", "technical spec", "engineering spec", or requests to document an architectural design before implementation. Use when capturing decisions already made — not for exploring options or running design conversations.
---

# Technical Requirements Document (TRD) Format

A TRD captures architectural decisions that have already been made. It is the single design narrative for a project, paired with two companion documents:

- `docs/ADR.md` — Architecture Decision Record: problems, approaches considered, and decision rationale (see the `alternatives` skill)
- `docs/TEST-PLAN.md` — testing strategy and verification approach (see the `test-plan` skill)

The TRD links to both. It does not duplicate their content. The problems that shaped the design and the reasoning behind approach selection live in the ADR — the TRD records *what* was built and *how*.

## Output location

Write to `docs/TRD.md` unless the user specifies otherwise.

## Core principles

- **Requirements describe what, not how.** Functional and non-functional requirements must be solution-agnostic. No class names, table names, library names, or implementation mechanisms in FR/NFR.
- **Take positions, don't enumerate.** Every decision in the doc reflects a choice. Hedging language signals incomplete thinking.
- **Be specific to this project.** No "follow SOLID" or "use clean architecture" generalities.
- **Out of scope is a deliberate engineering choice.** Non-goals get reasoning, not apologies.
- **Diagrams add information beyond prose.** If a diagram restates the surrounding text, delete it.
- **Link, don't duplicate.** Decision rationale lives in `ADR.md`. Testing strategy lives in `TEST-PLAN.md`. The TRD references them.

## Diagrams

Use Mermaid for all diagrams — renders natively in GitHub and lives in version control as text.

- `flowchart` for system and workflow diagrams
- `sequenceDiagram` for request/event flows
- `erDiagram` for database schemas (include types and cardinality)
- `stateDiagram-v2` for state machines

Label every node and edge meaningfully.

## Document structure

### 1. Overview
2-3 sentences. What we're building, why, and the core technical tension.

Include links to companion documents at the top:
> Related: [Architecture Decision Record](./ADR.md) · [Test Plan](./TEST-PLAN.md)

### 2. Goals
- **Goals:** bulleted, measurable where possible
- **Non-Goals:** explicit out-of-scope items for v1, each with reasoning

### 3. Functional Requirements
Numbered list (FR-1, FR-2, ...). Each one testable. Describe *what*, not *how* — no implementation detail, no class names, no library names, no mechanism descriptions.

### 4. Non-Functional Requirements
Bulleted quality attributes. Each must read as a requirement any valid implementation would need to satisfy — not a description of how the chosen implementation happens to satisfy it. No lock names, DB engine specifics, or library references.

### 5. Proposed Solution
2-3 paragraphs of prose describing the chosen approach end-to-end: what each component owns, how the pieces interact, how the key design problems are resolved. This is the first place implementation detail appears in the TRD. Links to ADR.md for the decision rationale behind major choices.

### 6. Architecture
- Module/component layout with each component's ownership
- Controllers, services, repositories, and their responsibilities
- Cross-cutting concerns: auth, validation, error handling, logging
- Async components: queues, schedulers, workers, and what each does
- Configuration strategy (env loading, validation)
- Observability: logging, metrics, tracing, health checks
- System diagram as Mermaid `flowchart`

### 7. Database Schema
- Mermaid `erDiagram` with entities, fields, types, cardinality
- Access patterns: list the queries the system will run and the indexes that support them. Flag N+1 risks and full-scan concerns.
- Transactions and concurrency: where transactions are required, optimistic vs pessimistic choices, how concurrent operations against the same record are serialized
- Migrations: tooling and workflow
- Data lifecycle: retention, archival, deletion — even if "keep forever," state it

### 8. APIs
For each endpoint:
- Method + path (or operation name for GraphQL/RPC)
- Purpose
- Request shape with field types and validation rules
- Response shape with field types
- Error cases (status codes + error body shape)
- Auth (guard, required roles/scopes)
- Idempotency strategy
- Rate limiting / caching notes if relevant

Group endpoints by controller/module. Include external integrations (clients to upstream systems) with their contract — request/response/error shapes, retry/timeout policy, circuit breaker behavior if any.

### 9. Workflows
One subsection per critical workflow. At minimum: happy paths for each FR, plus error/recovery paths for anything touching persistence or external systems.

Each subsection contains:
- 2-3 sentence description
- Mermaid `sequenceDiagram` or `flowchart` end-to-end
- Failure modes and recovery (retries, backoff, dead-letter handling, manual intervention triggers)

### 10. Testing
One paragraph noting anything about the design that meaningfully affects testing — external dependencies, time-sensitive behavior, non-deterministic flows, anything unusually hard to test.

Then: **See [`docs/TEST-PLAN.md`](./TEST-PLAN.md) for the full testing strategy.**

### 11. Folder Structure
Tree view of the proposed project layout (modules, controllers, services, DTOs, entities).

### 12. Dependencies
List of runtime and dev dependencies with one-line justifications for non-obvious choices.

### 13. Acceptance Criteria
How we know v1 is done. Map back to FRs.

## Common failure modes to avoid

- **Implementation detail in FR/NFR.** If an FR mentions a class name, lock mechanism, table name, or HTTP status code, it's describing the solution, not the requirement. Move those details to Section 5 or 6.
- **Diagrams that restate prose.** A diagram must reveal structure, sequence, or relationships that text struggles to convey.
- **ER diagrams without types or cardinality.** "User → Order" is not a schema. Include field types and `||--o{` style cardinality markers.
- **Mixing requirements with implementation.** FRs/NFRs describe *what* and *how well*; the architecture and data sections describe *how*.
- **Duplicating ADR content.** Section 5 links to ADR.md for rationale. If you find yourself writing pros/cons or comparison matrices in the TRD, move them to ADR.md.
- **Duplicating TEST-PLAN content.** Section 10 is a one-paragraph note plus a link. If you find yourself writing about test pyramids or mock servers in the TRD, move them to TEST-PLAN.md.
