---
name: trd
description: Use this skill whenever producing a Technical Requirements Document (TRD), design document, or technical spec. Triggers include any mention of "TRD", "technical requirements document", "design doc", "technical spec", "engineering spec", or requests to document an architectural design before implementation. Use when capturing decisions already made — not for exploring options or running design conversations.
---

# Technical Requirements Document (TRD) Format

A TRD captures architectural decisions that have already been made. It is the single design narrative for a project, paired with two companion documents:

- `docs/ALTERNATIVES.md` — full analysis of approaches considered (see the `alternatives` skill)
- `docs/TEST-PLAN.md` — testing strategy and verification approach (see the `test-plan` skill)

The TRD links to both. It does not duplicate their content.

## Output location

Write to `docs/TRD.md` unless the user specifies otherwise.

## Core principles

- **The Challenges section is the spine.** Reviewers read it first to gauge whether the author understood the problem. Make it excellent.
- **Take positions, don't enumerate.** Every decision in the doc reflects a choice. Hedging language signals incomplete thinking.
- **Be specific to this project.** No "follow SOLID" or "use clean architecture" generalities.
- **Out of scope is a deliberate engineering choice.** Non-goals get reasoning, not apologies.
- **Diagrams add information beyond prose.** If a diagram restates the surrounding text, delete it.
- **Link, don't duplicate.** Alternatives analysis lives in `ALTERNATIVES.md`. Testing strategy lives in `TEST-PLAN.md`. The TRD references them.

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
> Related: [Alternatives Considered](./ALTERNATIVES.md) · [Test Plan](./TEST-PLAN.md)

### 2. Goals and Non-Goals
- **Goals:** bulleted, measurable where possible
- **Non-Goals:** explicit out-of-scope items for v1, each with reasoning

### 3. Challenges
Numbered list of the hard problems this design must solve. For each:
- **Challenge (C-N):** one-sentence description with stable identifier
- **Why it's hard:** the underlying tension or constraint
- **How we handle it:** pointer to the section that addresses it

This is the spine of the document. Every challenge here must be addressed somewhere in the design. The stable identifiers (C-1, C-2, ...) let the test plan reference specific challenges in its regression guards.

### 4. Functional Requirements
Numbered list (FR-1, FR-2, ...). Each one testable. Avoid implementation detail — describe *what*, not *how*.

### 5. Decision Summary
For each major decision (data model, consistency model, transactional boundaries, conflict resolution, async architecture, external integration patterns):
- **Decision:** what was chosen
- **Rationale:** one or two sentences on why
- **See:** link to the relevant section in `ALTERNATIVES.md` for the full analysis

Keep this section tight. The detailed comparison of alternatives, pros/cons, and pressure-test outcomes belongs in `ALTERNATIVES.md`.

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

### 12. Acceptance Criteria
How we know v1 is done. Map back to FRs and challenges.

## Common failure modes to avoid

- **Diagrams that restate prose.** A diagram must reveal structure, sequence, or relationships that text struggles to convey.
- **ER diagrams without types or cardinality.** "User → Order" is not a schema. Include field types and `||--o{` style cardinality markers.
- **Mixing requirements with implementation.** FRs/NFRs describe *what* and *how well*; the architecture and data sections describe *how*.
- **Stale Section 3.** If you add a workflow or a new external dependency, the challenges it introduces belong in Section 3 too.
- **Duplicating ALTERNATIVES content.** Section 6 is a summary with links. If you find yourself writing full pros/cons or comparison matrices in the TRD, move them to `ALTERNATIVES.md`.
- **Duplicating TEST-PLAN content.** Section 11 is a one-paragraph note plus a link. If you find yourself writing about test pyramids or mock servers in the TRD, move them to `TEST-PLAN.md`.
