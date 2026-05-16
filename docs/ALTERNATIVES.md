# Alternatives Considered

Companion to [`docs/TRD.md`](./TRD.md). Each decision below corresponds to an entry in TRD Section 7 (Why This Approach).

---

## Decision 1: Balance Consistency Strategy

**Context.** The core design challenge of this service is maintaining balance integrity when the source of truth (HCM) is an external system that ReadyOn does not control. Balances can change in HCM at any time due to third-party events (work anniversaries, year-start resets). This decision addresses challenges C-1 (concurrent approvals), C-2 (external balance mutations), C-3 (partial failure on approve), and C-4 (batch sync race).

---

### Approach 1: HCM-Primary, No Local Balance Cache

**Description.** ReadyOn stores no balance data locally. Every balance read goes directly to HCM in real time. On submit, the service calls HCM to get the current balance, sums PENDING hours from its own DB, and checks if the new request fits. On approve, it calls HCM again (fresh read) then immediately debits. No local balance table exists. No batch sync is needed for correctness.

**Pros.**
- Single source of truth — HCM is always authoritative, no divergence possible
- No cache invalidation problem to solve
- No reconciliation logic to maintain
- Approve always sees the current balance, defending against external mutations (C-2) by design
- Simplest mental model: balance correctness is fully delegated to HCM

**Cons.**
- Every submit and every approve hits HCM — if HCM degrades, the entire flow is blocked
- No local balance history or audit trail
- Single-instance constraint: per-employee in-process lock works only within one process

**Pressure-test notes.**
- *Does the in-process lock cover submit too, or only approve?* Lock must cover submit — two concurrent submits for the same employee could both pass the balance check independently and together exceed the balance. Confirmed lock covers both.
- *What happens at scale with multiple instances?* In-process lock breaks under horizontal scaling. SQLite also does not support row-level locking. Acknowledged as a v1 constraint; production deployment requires an RDBMS with row-level locking (e.g., PostgreSQL) replacing the in-process lock with `SELECT ... FOR UPDATE`.
- *What does batch sync do in this approach?* With no local cache, batch sync has no correctness role. Dropped from v1 scope entirely.

---

### Approach 1-B: HCM-Primary with Async Queue (Variant)

**Description.** A variant of Approach 1 where HCM calls are dispatched to an async queue (BullMQ — the Node.js/NestJS equivalent of Sidekiq) rather than made synchronously inline. Submit and approve return an acknowledgment immediately; the actual HCM interaction and state transition happen asynchronously. Designed for scenarios where HCM reliability or rate-limiting assumptions break down.

**Pros.**
- Decouples request acceptance from HCM availability
- Provides natural retry and backoff semantics for HCM failures
- Handles rate-limited HCM scenarios gracefully

**Cons.**
- Employees receive "pending" acknowledgment rather than immediate feedback — worse UX
- Adds significant operational complexity: queue infrastructure, worker processes, dead-letter handling
- Concurrency model becomes harder: balance check and debit are no longer in the same synchronous sequence
- Balance shown to the employee at submit time may be stale by the time the async job runs

**Pressure-test notes.**
- Given our assumptions (HCM has 5 9's availability, no rate limiting), this variant adds complexity without proportional benefit.
- If assumptions change in production, this is the documented fallback path — not a v1 implementation.

---

### Approach 2: Local Balance Cache with Write-Through

**Description.** ReadyOn maintains a local `balances` table, populated by periodic batch sync from HCM and kept current by write-through on every approve and withdraw. Submit checks the local cache. Approve checks the cache, debits HCM, then updates the cache. Batch sync reconciles the cache against HCM's full corpus on a schedule.

**Pros.**
- Submit reads are fast — no HCM call required
- Balance visible locally for reporting and auditing
- Batch sync provides a full reconciliation point

**Cons.**
- Introduces a second source of truth — cache and HCM can diverge
- Cache staleness window between batch syncs means C-2 (external balance mutations) is only partially addressed
- Two partial-failure surfaces on approve: HCM call can fail AND cache update can fail
- Batch sync introduces C-4: sync running concurrently with an approval can overwrite balance data mid-flight
- Reconciliation logic is a permanent maintenance burden — every future change must consider cache consistency

**Pressure-test notes.**
- *What happens to PENDING requests when batch sync drops the cached balance below their sum?* Requires explicit reconciliation policy — flag them, reject at approve, or recalculate. No clean answer.
- *How often does batch sync run?* If hourly, a work anniversary update is stale for up to 59 minutes. Approach 1 avoids this entirely.
- *Write-through doubles the partial-failure surface.* C-3 complexity doubles compared to Approach 1 — two systems to keep in sync instead of one authoritative source.

---

### Approach 3: Optimistic Submit, HCM Gate at Approve

**Description.** Submit checks the local cache optimistically — no HCM call. The cache is kept warm by batch sync. Approve is the single point of truth: it always calls HCM for a fresh balance, validates, and debits. If the cache is absent, submit is still allowed. The employee may see an inaccurate balance at submit time; correctness is only enforced at approve.

**Pros.**
- Fastest submit path — no HCM call on submission
- Correctness fully enforced at the approve gate

**Cons.**
- Employees can submit requests against balances that don't exist — late rejection at approve time is a poor experience
- Manager approves based on submit-time balance shown in the UI, which may have been wrong
- If the local cache is absent or stale, the balance shown to the employee is meaningless
- Falls back to a live HCM call on cache miss anyway — reinvents Approach 1 for the unhappy path

**Pressure-test notes.**
- *An employee submits, plans their vacation, request sits PENDING for 3 days, manager approves, HCM rejects — balance was never there.* This is a product trust problem, not just a technical one. The employee made plans based on a number ReadyOn showed them that was wrong.
- *If cache is absent, what does the employee see as their balance?* Either nothing (bad UX) or a live HCM call — at which point Approach 1 is simpler and cleaner.

---

### Comparison

| Concern | Approach 1 (HCM-Primary) | Approach 1-B (Async Queue) | Approach 2 (Local Cache) | Approach 3 (Optimistic) |
|---|---|---|---|---|
| C-1: Concurrent approvals | Per-employee lock | Queue serializes per employee | Per-employee lock + local tx | Approve gate only |
| C-2: External balance mutations | Re-read at every approve | Re-read at job execution | Stale until next batch sync | Re-read at approve |
| C-3: Partial failure on approve | Single recovery point | Queue retry + dead-letter | Two recovery points | Single recovery point |
| C-4: Batch sync race | N/A — no cache | N/A — no cache | Lock required on sync | Acceptable staleness |
| C-5: Adapter routing | Runtime resolution | Runtime resolution | Runtime resolution | Runtime resolution |
| C-6: Cancel/approve race | Conditional DB update | Conditional DB update | Conditional DB update | Conditional DB update |
| Submit UX | Immediate feedback | Async acknowledgment | Immediate feedback | Immediate (may be wrong) |
| Operational complexity | Low | High (queue infra) | Medium (sync + cache) | Medium (sync + cache) |
| Consistency model | Strong (live reads) | Eventual | Eventual (between syncs) | Optimistic at submit |

---

**Decision.** Approach 1 (HCM-Primary, No Local Balance Cache).

HCM is the source of truth — the right design decision is to lean into that, not fight it by building a second source. The local cache in Approach 2 exists to solve a latency problem we don't have (HCM has 5 9's availability, is not rate-limited) while creating a consistency problem we'd carry permanently. Approach 3 trades submit-time accuracy for a faster submit path, but the product cost — employees planning vacations against wrong balances, managers approving on bad data — is too high for a time-off product where trust is the core value. Approach 1-B is documented as a fallback for production if the reliability assumptions change, but adds queue infrastructure complexity that is not justified by current constraints.

Approach 1 keeps the correctness story simple: HCM is always read live, the per-employee lock serializes the check-and-debit sequence, and the only recovery surface is the approve partial-failure case (C-3), which has a clean path: HCM call fails → DB remains PENDING → structured error returned to caller.

**Remaining weaknesses.**
- *Single-instance concurrency ceiling.* The in-process lock does not survive horizontal scaling. This is a documented v1 constraint. Production deployment requires an RDBMS with row-level locking.
- *Every submit and approve hits HCM.* If HCM availability drops below its 5 9's SLA, the submit and approve flows are blocked. Approach 1-B is the documented mitigation path if this becomes a problem.

---

## Decision 2: HCM Integration Pattern (Multi-Employer Adapter)

**Context.** The service is multi-employer, and each employer may use a different HCM system (Workday, SAP, others). This decision addresses C-5 (multi-employer HCM adapter routing) — specifically, how to resolve and invoke the correct HCM integration per request without leaking HCM-specific logic into the core service.

---

### Approach A: Runtime Adapter Factory

**Description.** A single `HcmAdapterFactory` resolves the correct adapter at runtime by looking up the employer's `hcmType` from `employer_hcm_config`. All adapters implement a shared TypeScript interface (`getBalance`, `debitBalance`, `reverseDebit`). The factory is injected into services; the rest of the codebase is HCM-agnostic.

**Pros.**
- Clean separation — core service logic has zero knowledge of HCM specifics
- Adding a new HCM type requires only a new adapter class
- Interface is the contract — adapters are independently testable
- `requestExternalId` passed on every debit/reversal call gives each adapter an idempotency hook if the HCM supports it

**Cons.**
- Misconfigured `hcmType` or `baseUrl` silently routes to wrong adapter until a real request is made
- Adapter resolution adds one DB lookup per request

**Pressure-test notes.**
- *What if an employer's HCM config is missing?* Factory throws a typed `HCM_CONFIG_NOT_FOUND` error, caught by the exception filter and returned as 422.
- *What if the adapter interface doesn't map cleanly to a specific HCM's API?* Each adapter is responsible for its own normalization — the interface contract is ReadyOn's internal model, not HCM's wire format.

---

### Approach B: Static Configuration (Env-var per HCM)

**Description.** HCM endpoints and credentials are hardcoded in environment variables. The service has a single HCM integration that all employers share. Employer-specific routing is handled by passing the employer's HCM credentials on each call.

**Pros.**
- Simpler to bootstrap for a single-employer deployment

**Cons.**
- Does not support multi-employer — each employer has a different HCM system, not just different credentials
- Adding a second HCM type requires code changes, not config changes
- No runtime adapter resolution means all HCM-specific branching bleeds into service logic

**Pressure-test notes.**
- Rejected early — the multi-employer requirement makes this a non-starter. Different employers use fundamentally different HCM systems with different APIs, not just different credentials.

---

**Comparison.**

| Concern | Approach A (Factory) | Approach B (Static Config) |
|---|---|---|
| Multi-employer support | Yes — per employer config | No — single HCM only |
| Adding a new HCM type | New adapter class only | Code changes required |
| HCM logic isolation | Complete | Bleeds into service layer |
| Misconfiguration risk | One DB lookup per request | Fails at boot |

**Decision.** Approach A (Runtime Adapter Factory). Multi-employer is a core requirement — static config was never viable. The adapter factory is the standard pattern for this kind of runtime polymorphism and keeps the service layer clean.

**Remaining weaknesses.** Misconfigured employer config produces a runtime error on the first real request rather than at boot. Mitigated by validating config on creation and covering adapter resolution in integration tests.

---

## Decision 3: Request Expiry and Auto-Cancellation

**Context.** PENDING requests that are never actioned by a manager represent a usability problem — employees have outstanding requests with no resolution. The question is when and how to expire them.

---

### Approach A: Time-based expiry (fixed duration from submission)

**Description.** A PENDING request is automatically cancelled N days after it was submitted, regardless of its start date.

**Pros.**
- Simple rule — easy to explain to users

**Cons.**
- A request submitted 2 weeks before its start date could be cancelled before the manager has a reasonable chance to act
- The relevant deadline is not "how long since submission" but "is it still actionable"

**Pressure-test notes.**
- Dismissed early — the business-meaningful deadline is the leave start date, not the submission date.

---

### Approach B: Start-date-based expiry (cancel when start date passes)

**Description.** The daily 8am scheduler cancels any PENDING request where `today > startDate`. The leave window has opened with no manager decision — the request is no longer actionable. Additionally, managers receive a daily reminder for all PENDING requests where `startDate >= today` to encourage timely action.

**Pros.**
- Business-meaningful rule — a request is cancelled only when it's actually too late to act on it
- Self-correcting: if the scheduler misses a run, it catches up on the next execution (condition is date-based, not run-based)
- Daily reminder creates natural pressure on managers without hard-coding an arbitrary duration

**Cons.**
- A request submitted for a start date 6 months out could sit PENDING indefinitely — daily reminders are the only pressure mechanism

**Pressure-test notes.**
- *Race condition: manager approves at 7:59am, scheduler cancels at 8:00am.* Mitigated by conditional DB update (`WHERE status = PENDING`) — whichever transaction commits second sees the already-transitioned state and no-ops.

---

**Comparison.**

| Concern | Approach A (Fixed Duration) | Approach B (Start-date Based) |
|---|---|---|
| Business meaningfulness | Low — arbitrary deadline | High — tied to actual leave window |
| Race condition with approve | Same risk | Mitigated by conditional update |
| Scheduler missed run | Must track last-run time | Self-correcting |
| Manager pressure | Blunt | Daily reminder is the mechanism |

**Decision.** Approach B (Start-date-based expiry). The only meaningful cancellation trigger is the leave start date passing — anything else is an arbitrary rule that creates friction without reflecting the actual business constraint.

**Remaining weaknesses.** Long-horizon requests (submitted months in advance) generate daily reminders for their full pending lifetime. Acceptable in v1 — notification fatigue is a product problem to solve later.
