---
name: test-plan
description: Use this skill whenever producing a test plan, testing strategy document, or test specification. Triggers include any mention of "test plan", "test strategy", "testing strategy", "test specification", "test pyramid", or requests to document how a system will be verified. Use as a companion to a TRD — the TRD captures the design; this document captures how the design will be tested and the regression scenarios that must hold.
---

# Test Plan Format

This document captures the complete testing strategy for a project. It exists because testing is too important to bury inside a TRD section, and it lives long enough that it deserves its own file — implementation changes the test code constantly, and that activity shouldn't churn the design document.

The TRD links to this document. The TRD's testing section is a one-paragraph note about anything in the design that affects testing; the full strategy lives here.

## Output location

Write to `docs/TEST-PLAN.md` unless the user specifies otherwise.

## Core principles

- **Tests are the executable spec.** When AI implements code, tests are the contract. They must describe behavior precisely enough that an implementing agent can satisfy them without inventing requirements.
- **Cover the challenges.** Every challenge in `TRD.md` Section 3 (C-1, C-2, ...) needs at least one named regression guard that prevents that specific failure mode from coming back.
- **Mock servers, not stubs.** External dependencies are simulated with real mock servers that have state and configurable behavior — not inline test stubs.
- **Test what hurts when it breaks.** Coverage targets should reflect risk, not vanity. 100% coverage of a CRUD repository matters less than 70% coverage of a module with subtle failure modes.

## Document structure

### Header

Start with:
> Companion to [`docs/TRD.md`](./TRD.md). Challenges referenced as C-N correspond to TRD Section 3.

### 1. Test Pyramid

Describe what's covered at each layer and why each layer exists. Be specific to this project.

- **Unit tests.** What's tested in isolation. Which kinds of code (pure functions, services with mocked dependencies, validators, mappers). What's intentionally not unit-tested and why.
- **Integration tests.** What's tested with real dependencies (real database, real queue, real config). Where the boundaries are drawn.
- **End-to-end tests.** Full request paths through the running service, with external systems mocked. Which workflows from `TRD.md` Section 10 each e2e test covers.

Note the rough proportions you're aiming for and the rationale.

### 2. Mock Servers

For each external dependency, describe how it's simulated. Real mock servers with state and configurable behaviors — not inline stubs.

For each mock:

- **What it simulates.** The external system and which of its endpoints/behaviors are modeled.
- **Implementation.** The tool or approach (e.g., a small NestJS app, WireMock, Prism, MSW), and how it's started and torn down in test runs.
- **State management.** How records and other state are seeded, mutated, and reset between tests.
- **Configurable behaviors.** The failure modes and edge cases the mock can be put into:
  - Normal responses
  - Error responses (rate limit, auth failure, validation rejection)
  - Timeouts and slow responses
  - Intermittent failures
  - Silent acceptance of invalid input (defensive scenarios)
  - Independent state changes between calls (state mutating server-side between requests)
- **Determinism.** How the mock avoids flakiness — clocks, random IDs, ordering.

### 3. Coverage Targets

What is measured and the threshold. What's intentionally not covered and why.

- **Line/branch coverage thresholds** for the test suite as a whole and for critical modules.
- **Specific modules with elevated targets** (e.g., a module with non-obvious failure modes: 90% branch coverage minimum).
- **Excluded paths.** What's deliberately not measured — generated code, third-party adapters, bootstrap code — and the rationale.

Avoid coverage theater. State explicitly that hitting the number isn't the goal; covering the *risky* paths is.

### 4. Regression Guards

Specific scenarios that must not regress, drawn from the challenges in `TRD.md` Section 3. Each becomes a named test or test group.

Format each as:

- **Guard:** Short name describing the invariant being protected (e.g., "Concurrent updates to the same record never produce a lost write")
- **Protects:** Challenge ID(s) from the TRD (e.g., C-1, C-4)
- **Scenario:** 2-3 sentences describing the test setup, the action taken, and the expected outcome
- **Layer:** Which layer of the pyramid this lives at (unit, integration, e2e)

Every challenge in the TRD should have at least one regression guard here. If a challenge has no guard, either add one or explain why it's not testable.

### 5. Test Data Strategy

How test data is created and managed:

- **Factories.** What pattern is used (factory functions, builders, fixtures).
- **Realistic vs minimal.** When tests use realistic data vs minimal data, and why.
- **Shared fixtures.** Whether tests share data setup or each test is independent. Tradeoffs of each.
- **Database state between tests.** Truncation, transactions with rollback, separate schemas — which approach and why.

### 6. Non-Determinism Handling

How the test suite stays reliable:

- **Time.** How `Date.now()` and timers are controlled. Fake timers, injected clocks, or other patterns.
- **Random.** Seeded random or deterministic ID generation.
- **Ordering.** How tests avoid relying on Map/Set/Object key ordering or async race conditions.
- **Async.** How tests wait for background work (queues, schedulers) to complete deterministically.

### 7. Test Tooling

The concrete stack:

- **Test runner.** (Jest, Vitest, etc.) with one-line justification.
- **HTTP test client.** (Supertest, etc.) for e2e tests.
- **Mock server tooling.** (NestJS test app, WireMock, MSW, Prism).
- **Coverage tool.** What measures coverage and where reports land.
- **Test commands.** The npm scripts to run the suites (unit, integration, e2e, all, watch).

### 8. CI Integration

How tests run in CI:

- Which suites run on every commit vs only on main
- How mock servers are started in CI
- Coverage report publication
- Flake handling policy (retry, quarantine, or fail fast)

### 9. What's Not Tested

Honest section on what the test plan explicitly does not cover, and why:

- Performance/load testing (separate effort? not in scope?)
- Security testing (handled by another process? out of scope?)
- Chaos / resilience testing
- Browser or client-side concerns

Stating these explicitly prevents the assumption that "everything is covered" when reviewers see a test plan.

## Common failure modes to avoid

- **Coverage theater.** Targeting 90% coverage without thinking about which code matters most. A risky module at 70% coverage with all failure paths tested beats a 95%-covered DTO mapper.
- **Mock stubs masquerading as mocks.** A function that returns a hardcoded value is a stub. A mock server has state, can be put into failure modes, and exercises the real wire protocol. The distinction matters for confidence.
- **Missing regression guards.** Every challenge in the TRD should map to at least one named regression guard. Gaps here mean the design's known risks aren't covered.
- **Flaky tests treated as normal.** Document the determinism strategy. A flaky suite trains the team to ignore failures.
- **No "what's not tested" section.** Without explicit non-coverage, reviewers assume comprehensive coverage. State the gaps.
