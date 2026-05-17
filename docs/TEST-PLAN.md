# Test Plan — Time-Off Microservice

> Companion to [`docs/TRD.md`](./TRD.md). Challenges referenced as C-N correspond to TRD Section 3.

---

## 1. Test Pyramid

### Unit Tests

Unit tests cover logic that can be verified without a database or HTTP call. This includes:

- **State machine guards** — `RequestsService` transition logic: valid and invalid transitions from each status (`PENDING → APPROVED`, `PENDING → REJECTED`, `APPROVED → WITHDRAWN`, etc.)
- **Balance guard** — the arithmetic check `pendingHours + requestedHours ≤ balance` in isolation, including edge cases (exact boundary, zero balance, zero pending)
- **Overlap detection** — the date range overlap predicate used before lock acquisition
- **Scheduler cancellation logic** — the condition `today > startDate` evaluated against a frozen clock
- **HcmAdapterFactory resolution** — correct adapter returned for `WORKDAY` and `SAP` hcmTypes; error thrown for unknown or missing config
- **DTO validation** — `class-validator` rules on all DTOs (missing required fields, invalid enum values, `endDate < startDate`, `requestedHours <= 0`)
- **HttpExceptionFilter** — correct `{ code, message }` shaping for all exception types

Unit tests do **not** cover repositories, controllers, or the full NestJS DI graph. Those are integration concerns. Mocking the DB in unit tests would only test the mock — the queries that matter are tested at the integration layer against a real database.

Proportion: ~20% of the suite by count, but fast — the full unit suite should run in under 5 seconds.

---

### Integration Tests

Integration tests run the full NestJS application with a real SQLite in-memory database and a live mock HCM server. This is the primary correctness layer — the majority of test coverage lives here.

Each integration test:
- Boots the full NestJS module graph via `@nestjs/testing`
- Wires a real `better-sqlite3` in-memory database with migrations applied
- Points the HCM adapters at the mock HCM server (see Section 2)
- Injects `FixedClockService` and `DeterministicUuidService` in place of the real implementations
- Makes HTTP requests via Supertest and asserts on response status, body, and DB state

Integration tests cover:
- All 10 API endpoints — happy path and every documented error case
- All state transitions including invalid ones
- The full approve sequence: lock → HCM read → balance check → HCM debit → DB write
- The full withdraw-APPROVED sequence: lock → HCM reversal → DB write
- Concurrent approve attempts for the same employee (C-1)
- Balance change between submit and approve (C-2)
- HCM debit failure after balance check passes (C-3)
- Scheduler auto-cancel racing with an approve (C-4)
- All HCM error modes: 503, timeout, domain error (C-6)
- Comment creation and retrieval
- Idempotent re-approve and re-reject

Proportion: ~70% of the suite. Each test is independent — DB is reset between tests (see Section 5).

---

### End-to-End Tests

E2E tests run the NestJS application as a real HTTP server (not via `@nestjs/testing`) and exercise it via Supertest. The mock HCM server is still used. These tests prove the HTTP wiring, middleware stack, and exception filter are correctly assembled.

E2E tests cover the following workflows from TRD Section 11:
- Submit → Approve happy path (employee submits, manager approves, balance debited)
- Submit → Reject happy path
- Submit → Withdraw (PENDING) happy path
- Approve → Withdraw (APPROVED with HCM reversal) happy path
- Get balance pass-through
- Add and retrieve a comment

E2E tests do **not** duplicate integration test error paths. They exist only to verify the running service behaves correctly end-to-end, not to exhaustively cover failure modes.

Proportion: ~10% of the suite. Slower than integration tests due to full server boot.

---

## 2. Mock Servers

### HCM Mock Server

**What it simulates.** The HCM HTTP API consumed by `WorkdayAdapter` and `SapAdapter`. Simulates `GET /balance` (getBalance), `POST /debit` (debitBalance), and `POST /reverse` (reverseDebit). The mock is HCM-type-agnostic — both adapters point to it in tests; adapter-specific URL and header differences are tested at the adapter unit level.

**Implementation.** A small Express application in `test/mocks/hcm-mock-server/`. It starts on a random available port before the test suite and shuts down after. The port is injected into the NestJS test module via environment config so adapters point to it. Started with `beforeAll` / `afterAll` at the integration suite level (not per-test — startup cost is paid once per suite file).

**State management.** The mock server holds an in-memory balance map keyed by `(employerId, employeeId, locationId, leaveType, year)`. A control API (`POST /mock/seed`, `POST /mock/reset`, `POST /mock/configure`) allows tests to seed balances, reset state, and configure behavior before each test. Each test calls `POST /mock/reset` in `beforeEach` to ensure a clean slate.

**Configurable behaviors.**

| Mode | How to activate | What it does |
|---|---|---|
| Normal | `POST /mock/seed` with balance values | Returns configured balance; accepts debit and reversal |
| Insufficient balance error | `POST /mock/configure { mode: 'INSUFFICIENT_BALANCE' }` | Returns 422 domain error on debit |
| Invalid dimensions error | `POST /mock/configure { mode: 'INVALID_DIMENSIONS' }` | Returns 422 domain error on debit |
| 503 Infrastructure error | `POST /mock/configure { mode: 'SERVER_ERROR' }` | Returns 503 on any call |
| Timeout | `POST /mock/configure { mode: 'TIMEOUT', delayMs: 6000 }` | Delays response past the 5s adapter timeout |
| Silent acceptance | `POST /mock/configure { mode: 'SILENT_ACCEPT' }` | Accepts any debit without error, even against zero balance — simulates unreliable HCM error signaling (C-6) |
| Mid-test balance mutation | `POST /mock/mutate` with new balance values | Changes the balance between two calls — simulates a work anniversary running between submit and approve (C-2) |
| Reversal error | `POST /mock/configure { mode: 'REVERSAL_ERROR' }` | Returns 503 on `POST /reverse` only |

**Determinism.** The mock server uses no random values. All responses are deterministic based on seeded state and configured mode. Debit calls track the `requestExternalId` passed in and return it in responses — tests can assert that the correct idempotency key was sent.

---

## 3. Coverage Targets

| Scope | Target | Rationale |
|---|---|---|
| `src/requests/requests.service.ts` | 95% branch | The most complex module — concurrency, balance guard, state machine, HCM orchestration |
| `src/requests/requests.repository.ts` | 90% line | All query paths exercised via integration tests |
| `src/balance/balance.service.ts` | 90% line | Pass-through with error mapping |
| `src/scheduler/scheduler.service.ts` | 90% branch | Two distinct jobs; date boundary condition matters |
| `src/hcm/hcm-adapter.factory.ts` | 100% branch | All resolution paths must be covered; silent misrouting is a C-5 risk |
| `src/hcm/adapters/*.adapter.ts` | 80% line | Error mapping paths; exact wire format tested at integration layer |
| Overall service layer (`src/**`) | 90% line | Baseline |
| Excluded from coverage | `src/database/migrations/`, `src/app.module.ts`, `src/main.ts` | Bootstrap and generated code |

Hitting 90% is not the goal. The goal is covering every path in `RequestsService` that involves an external call or a state transition. A suite that reaches 90% without covering the concurrent-approve scenario (C-1) or the HCM-silent-accept scenario (C-6) has failed regardless of the number.

---

## 4. Regression Guards

### RG-1: Concurrent approvals cannot overdraw balance

**Protects:** C-1

**Scenario:** Two concurrent approve calls are made for two different PENDING requests belonging to the same employee. Each request alone fits within the available HCM balance, but together they exceed it. The test fires both approve calls simultaneously and asserts that exactly one succeeds (200) and one fails (422 INSUFFICIENT_BALANCE or 409 INVALID_TRANSITION). The HCM mock is seeded with a balance just large enough for one request. After the test, the mock asserts that `debitBalance` was called exactly once.

**Layer:** Integration

---

### RG-2: Approve re-reads balance after external mutation

**Protects:** C-2

**Scenario:** An employee submits a request against a balance of 80 hours. The HCM mock is then mutated (via `POST /mock/mutate`) to reduce the balance to 0 hours — simulating a work-anniversary rollback or manual HR adjustment between submit and approve. The manager then attempts approval. The test asserts that the approval fails with 422 INSUFFICIENT_BALANCE, proving the approve path re-read the balance rather than trusting the submit-time check.

**Layer:** Integration

---

### RG-3: HCM debit failure leaves DB as PENDING

**Protects:** C-3

**Scenario:** The HCM mock is configured to return 503 on `POST /debit`. A manager approves a PENDING request. The test asserts the API returns 503 HCM_UNAVAILABLE, and a subsequent GET on the request confirms the status is still PENDING (not APPROVED). The mock asserts that `debitBalance` was called once and no DB transition occurred.

**Layer:** Integration

---

### RG-3b: HCM reversal failure leaves DB as APPROVED

**Protects:** C-3

**Scenario:** An APPROVED request is withdrawn. The HCM mock is configured to return 503 on `POST /reverse`. The test asserts the API returns 503 HCM_UNAVAILABLE, and a subsequent GET confirms the status is still APPROVED. No state transition record is created.

**Layer:** Integration

---

### RG-4: Scheduler cancel races with approve

**Protects:** C-4

**Scenario:** A PENDING request with `startDate = yesterday` exists in the DB. The scheduler job and an approve call are triggered concurrently. The test asserts that exactly one of the two operations wins: either the request is CANCELLED (scheduler won) or APPROVED (approve won, HCM was debited). The invalid outcome — CANCELLED with an HCM debit, or APPROVED with a scheduler cancel logged — must not occur.

**Layer:** Integration

---

### RG-5: HCM config not found returns structured error

**Protects:** C-5

**Scenario:** A submit request is made for an `employerId` with no entry in `employer_hcm_config`. The test asserts the API returns 422 with code `HCM_CONFIG_NOT_FOUND`. No lock is acquired and no DB write occurs.

**Layer:** Integration

---

### RG-5b: Wrong hcmType does not silently route to wrong adapter

**Protects:** C-5

**Scenario:** `HcmAdapterFactory` is unit-tested with an `hcmType` value of `UNKNOWN_HCM`. The test asserts that the factory throws a typed error rather than returning a partial or default adapter.

**Layer:** Unit

---

### RG-6: ReadyOn enforces balance check even when HCM silently accepts invalid debit

**Protects:** C-6

**Scenario:** The HCM mock is configured in `SILENT_ACCEPT` mode — it accepts any debit without error, regardless of balance. The HCM balance is seeded at 0 hours. An employee attempts to submit a request for 8 hours. The test asserts that the service returns 422 INSUFFICIENT_BALANCE (from ReadyOn's own guard) and that `debitBalance` is never called. ReadyOn's local check is the gate, not HCM's response.

**Layer:** Integration

---

### RG-7: Re-approve is idempotent — no double debit

**Protects:** NFR: Idempotency

**Scenario:** A request is approved successfully. The same approve call is made again. The test asserts the second call returns 200 with the APPROVED request, and the HCM mock confirms `debitBalance` was called exactly once across both calls.

**Layer:** Integration

---

### RG-8: Cancellation job cancels PENDING past startDate, skips future requests

**Protects:** FR-13, C-4

**Scenario:** Three PENDING requests exist: one with `startDate = yesterday`, one with `startDate = today`, one with `startDate = tomorrow`. The 11:59pm cancellation job is triggered manually with a frozen clock. The test asserts that only the yesterday request is cancelled (status = CANCELLED, reason = no_action_taken), the other two remain PENDING, and `NotificationService.notifyEmployee` is called once for the cancelled request only.

**Layer:** Integration

---

### RG-8b: Reminder job notifies managers only for non-expired PENDING requests

**Protects:** FR-13

**Scenario:** Three PENDING requests exist: one with `startDate = yesterday`, one with `startDate = today`, one with `startDate = tomorrow`. The 8am reminder job is triggered manually with a frozen clock. The test asserts that `NotificationService.notifyPendingRequests` is called with only the today and tomorrow requests — not the already-expired one.

**Layer:** Integration

---

### RG-9: Withdraw APPROVED posts HCM reversal with correct requestExternalId

**Protects:** FR-7

**Scenario:** An APPROVED request is withdrawn. The test asserts the API returns 200 WITHDRAWN, and the HCM mock records that `reverseDebit` was called with the correct `requestExternalId` matching the original request's `externalId`.

**Layer:** Integration

---

### RG-11: Employee notified on every terminal state transition

**Protects:** FR-15

**Scenario:** Four separate tests, one per transition: approve, reject, withdraw (PENDING), and scheduler cancel. In each case, the test asserts that `NotificationService.notifyEmployee` is called exactly once with the correct `employeeId` and the correct transition status. The notification must fire after the DB write succeeds — not before.

**Layer:** Integration

---

### RG-12: UNAUTHORIZED_ACTOR on approve and reject by non-manager

**Protects:** managerId enforcement (AC-21)

**Scenario:** A request is submitted with `managerId: 'mgr-1'`. A second actor (`actorId: 'emp-2'`) attempts to approve it. The test asserts the response is 403 with `code: UNAUTHORIZED_ACTOR` and the request remains PENDING with no HCM call made. A separate test repeats the same check for reject.

**Layer:** Integration

---

### RG-13: GET /requests filters by status and employeeId

**Protects:** GET /requests (AC-22)

**Scenario:** Three requests are submitted with different `employeeId` values and transitioned to different statuses (PENDING, APPROVED, REJECTED). A `GET /requests?status=PENDING` call is made and asserts only the PENDING request appears in `items`. A `GET /requests?employeeId=emp-1` call asserts only that employee's requests appear. Pagination fields (`total`, `limit`, `offset`) are present in every response.

**Layer:** Integration

---

### RG-14: PATCH /manager rejected on non-PENDING requests

**Protects:** PATCH /manager (AC-23)

**Scenario:** A request is submitted and approved. A `PATCH /requests/:externalId/manager` with `managerId: 'mgr-2'` is issued. The test asserts a 409 INVALID_TRANSITION response and that the managerId in the DB is unchanged. A separate test verifies the same endpoint succeeds (200) on a PENDING request and that the managerId is updated in the DB.

**Layer:** Integration

---

## 5. Test Data Strategy

**Factories.** All test data is created via factory functions in `test/helpers/factories.ts`. Each factory accepts a partial override object and merges it with sensible defaults. Example: `makeRequest({ leaveType: 'SICK', requestedHours: 16 })`. Factories never share state — each call produces an independent object. All submit request fixtures must include `managerId` — it is `NOT NULL` with no default. Tests that verify manager-specific behavior use `managerId: 'mgr-1'` by convention; tests that want to exercise 403 paths submit with one managerId and call approve/reject with a different `actorId`.

**Realistic vs minimal.** Tests use minimal data — only the fields relevant to the scenario under test. Realistic data (actual employee names, realistic date ranges) is not used because it adds noise without improving confidence. Exception: date-sensitive tests use dates relative to a frozen clock so the scenario is legible.

**Database state between tests.** Each integration test file boots a fresh in-memory SQLite database with migrations applied. Within a test file, `beforeEach` truncates all tables (not a transaction rollback — truncation is faster and avoids SQLite transaction nesting limits). This means each test starts from a known-empty state. Shared fixtures within a file are acceptable only for read-only setup (e.g., seeding `employer_hcm_config`).

**HCM mock state between tests.** `POST /mock/reset` is called in `beforeEach` for every integration test file that uses the HCM mock. This resets the balance map and clears any configured failure modes.

---

## 6. Non-Determinism Handling

**Time.** `ClockService` is injected across all time-dependent code (`SchedulerService`, `RequestsService` for `createdAt`/`updatedAt`). In tests, `FixedClockService` (in `test/helpers/fixed-clock.service.ts`) returns a configurable frozen timestamp. Tests that exercise date boundary conditions (scheduler cancellation, overlap detection) always set the clock explicitly before the assertion.

**Random IDs.** `UuidService` is injected in `RequestsService` for `externalId` generation. In tests, `DeterministicUuidService` (in `test/helpers/deterministic-uuid.service.ts`) returns a counter-based UUID sequence (`00000000-0000-0000-0000-000000000001`, `...0002`, etc.). This makes `externalId` values predictable in assertions without hardcoding magic strings.

**Async scheduler.** `SchedulerService` is tested by calling its job method directly (`schedulerService.runDailyJob()`) rather than waiting for the cron to fire. This eliminates timer-based flakiness entirely.

**Concurrency tests.** RG-1 and RG-4 (concurrent operations) use `Promise.all` to fire requests simultaneously. SQLite's serialized write model means these tests are deterministic — one will always win. The test asserts on the outcome (one success, one failure) rather than on which specific request won.

**Test ordering.** Tests within a file are fully independent — no shared mutable state between tests. Jest's `--runInBand` is used for integration and e2e tests to avoid SQLite file contention across parallel workers.

---

## 7. Test Tooling

| Tool | Purpose |
|---|---|
| **Jest** | Test runner — first-class NestJS support, built-in coverage via V8, watch mode |
| **ts-jest** | TypeScript compilation for Jest — no separate build step required |
| **Supertest** | HTTP assertions against the NestJS app — used in both integration and e2e tests |
| **@nestjs/testing** | `Test.createTestingModule()` for integration tests — full DI graph with overrides |
| **Express (mock server)** | Lightweight HTTP mock server for HCM in `test/mocks/hcm-mock-server/` |
| **better-sqlite3** | SQLite driver — in-memory database for integration tests |
| **jest-coverage (V8)** | Coverage reporting — outputs `coverage/lcov.info` and HTML report |

**Test commands:**

```json
{
  "test:unit": "jest --testPathPattern=test/unit --coverage",
  "test:integration": "jest --testPathPattern=test/integration --runInBand",
  "test:e2e": "jest --testPathPattern=test/e2e --runInBand",
  "test": "jest --runInBand --coverage",
  "test:watch": "jest --watch"
}
```

---

## 8. CI Integration

**Which suites run when:**
- Unit tests run on every commit to every branch
- Integration and e2e tests run on every pull request and on every push to `main`
- Coverage thresholds are enforced on `main` only — PRs get a coverage report but do not fail on threshold

**Mock server in CI.** The HCM mock server starts in-process as part of the Jest global setup (`jest.globalSetup.ts`). No external infrastructure is required — the mock runs in the same Node.js process tree as the tests. This means CI needs no Docker or service containers.

**Coverage publication.** Jest outputs `coverage/lcov.info` after each run. CI publishes the HTML report as a build artifact. A coverage summary is posted as a PR comment via the CI coverage reporter.

**Flake policy.** No automatic retries. A flaky test is a bug — it is quarantined (`.skip`) immediately, a tracking issue is filed, and it is fixed before the next release. Flaky tests that are retried silently hide real reliability problems.

---

## 9. What's Not Tested

**Performance and load testing.** Not covered in this plan. The service is expected to handle tens of thousands of employees at ~20% request volume — well within SQLite's single-instance throughput. Load testing is a separate effort if that assumption is challenged.

**Security testing.** Auth is handled at the gateway layer. No auth logic exists in this service. Penetration testing, fuzzing, and OWASP-style scanning are handled by the platform security team, not this service's test suite.

**HCM adapter contract testing against real HCM systems.** The `WorkdayAdapter` and `SapAdapter` are tested against the mock server only. Actual Workday and SAP API conformance is verified during per-employer onboarding, not in the automated test suite.

**Multi-instance / distributed concurrency.** The in-process lock is a single-instance guarantee. Testing concurrent requests across two running instances is not meaningful with SQLite and is out of scope for v1.

**Notification delivery.** `NotificationService` is a stub in v1. The test suite asserts that `notifyPendingRequests` is called with the correct arguments — not that a notification was actually delivered. SNS integration testing is deferred to when the real implementation is built.

**Browser or client-side concerns.** This is a backend-only service. No UI, no browser testing.
