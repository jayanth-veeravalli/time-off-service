# ADR: Time-Off Microservice — Architecture Decisions

> Architecture Decision Record for the Time-Off Microservice. This document captures the problems that shaped the design, the approaches considered, and the rationale for the chosen solution.
>
> Related: [TRD](./TRD.md) · [Test Plan](./TEST-PLAN.md)

---

## Status

PENDING REVIEW

---

## Overview

See the [Overview](./TRD.md#1-overview) and [Goals](./TRD.md#2-goals) in the TRD for broader context.

This document captures all solutions considered, the solution being implemented, and why that solution was chosen.

---

## Problems That Shape the Solution

Three properties of the HCM integration create the core design tension:

1. **Dual access modes.** HCM provides both real-time and batch endpoints to retrieve balance information.
2. **Independent balance mutations.** Balances can change outside of ReadyOn at any time (for example, a company adding or removing benefits).
3. **Unreliable error signaling.** HCM system responses are not guaranteed to accurately reflect balance errors.

**What matters most to the caller:** Employees and approvers must always receive accurate balance information. Approving against a stale or incorrect balance erodes trust in the product.

### Assumptions

1. HCM services have 5 9's availability.
2. The service is hosted on an internal gateway. All service-to-service authentication is handled by the gateway.
3. Org hierarchy is hosted by a separate service. The calling service provides all necessary information; if using GraphQL, the time-off service can resolve data from other services via federation schema.
4. Only a manager can approve a request. Supporting hierarchy approvals would require an additional authorization step in the approval flow.
5. ReadyOn is not currently rate-limited by HCM systems. If rate limiting is introduced, synchronous processing can no longer be guaranteed and async processing with eventing would be required (see [Approach 1-B](#approach-1-b-hcm-primary-with-async-queue-variant)).

---

## Approaches Considered

### Approach 1: HCM-Primary, No Local Balance Cache

**Description.** ReadyOn stores no balance data locally. Every balance read goes directly to HCM in real time. On submit, the service calls HCM to get the current balance, sums PENDING hours from its own DB, and checks if the new request fits. On approve, it calls HCM again (fresh read) then immediately debits. No local balance table exists. No batch sync is needed for correctness.

**Pros.**
- Single source of truth — HCM is always authoritative, no divergence possible
- No cache invalidation problem to solve
- No reconciliation logic to maintain
- Approve always sees the current balance, defending against external mutations by design
- Simplest mental model: balance correctness is fully delegated to HCM

**Cons.**
- Every submit and every approve hits HCM — if HCM degrades, the entire flow is blocked
- No local balance history

---

### Approach 1-B: HCM-Primary with Async Queue (Variant)

**Description.** A variant of Approach 1 where HCM calls are dispatched to an async queue rather than made synchronously inline. Submit and approve return an acknowledgment immediately; the actual HCM interaction and state transition happen asynchronously. Designed for scenarios where HCM reliability or rate-limiting assumptions break down.

**Pros.**
- Decouples request acceptance from HCM availability
- Provides natural retry and backoff semantics for HCM failures
- Handles rate-limited HCM scenarios gracefully

**Cons.**
- Employees receive "pending" acknowledgment rather than immediate feedback
- Adds significant operational complexity: queue infrastructure, worker processes, dead-letter handling
- Concurrency model becomes harder: balance check and debit are no longer in the same synchronous sequence
- Balance shown to the employee at submit time may be stale by the time the async job runs

---

### Approach 2: Local Balance Cache with Write-Through

**Description.** ReadyOn maintains a local `balances` table, populated by periodic batch sync from HCM and kept current by write-through on every approve and withdraw. Submit checks the local cache. Approve checks the cache, debits HCM, then updates the cache. Batch sync reconciles the cache against HCM's full corpus on a schedule.

**Pros.**
- Submit reads are fast — no HCM call required
- Balance visible locally for reporting and auditing
- Batch sync provides a full reconciliation point

**Cons.**
- Introduces a second source of truth — cache and HCM can diverge
- Notoriously difficult to keep in sync across a two-system commit boundary
- Cache staleness window between batch syncs means external balance mutations may not be reflected in time
- Two partial-failure surfaces on approve: HCM call can fail AND cache update can fail
- Reconciliation logic is a permanent maintenance burden — every future change must consider cache consistency

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

---

## Comparison

| Concern | [Approach 1](#approach-1-hcm-primary-no-local-balance-cache) | [Approach 1-B](#approach-1-b-hcm-primary-with-async-queue-variant) | [Approach 2](#approach-2-local-balance-cache-with-write-through) | [Approach 3](#approach-3-optimistic-submit-hcm-gate-at-approve) |
|---|---|---|---|---|
| Balance accuracy at submit | Live read | Eventual (async) | Cache (may be stale) | Cache (may be wrong) |
| Balance accuracy at approve | Live re-read | Live re-read at job time | Live re-read | Live read |
| External mutation defense | Full — re-read at every approve | Full — re-read at job execution | Partial — stale until next sync | Full at approve only |
| Partial failure on approve | Single recovery point (DB stays PENDING) | Queue retry + dead-letter | Two recovery points (HCM + cache) | Single recovery point |
| HCM outage impact | Submit and approve blocked | Queued; workers retry | Submit unaffected; approve blocked | Submit unaffected; approve blocked |
| Operational complexity | Low | High (queue infra) | Medium (sync + cache) | Medium (sync + cache) |
| Employee UX | Immediate, accurate | Async acknowledgment | Immediate (may be wrong) | Immediate (may be wrong) |

---

## Decision

**Chosen approach: [Approach 1 — HCM-Primary, No Local Balance Cache](#approach-1-hcm-primary-no-local-balance-cache).**

See [Proposed Solution](./TRD.md#5-proposed-solution) in the TRD for how this decision is reflected in the implementation.

HCM is the source of truth — the right design decision is to lean into that, not fight it by building a second source. The local cache in Approach 2 exists to solve a latency problem while creating a consistency problem we'd carry permanently. Approach 3 trades submit-time accuracy for a faster submit path, but the product cost — employees planning vacations against wrong balances, managers approving on bad data — is too high for a time-off product where trust is the core value. Approach 1-B is documented as a fallback for production if the reliability assumptions change, but adds queue infrastructure complexity that is not justified by current constraints.

Approach 1 keeps the correctness story simple: HCM is always read live, the check-and-debit sequence is serialized per employee, and the only recovery surface is the approve partial-failure case — if the HCM debit fails, the DB remains PENDING and a structured error is returned to the caller.

**Why this approach?**

- Always reading up-to-date data at the time of approval and submit. If the balance is lower at approval than at submit, the service raises a proper error and the employee can sync with HR to understand the discrepancy.
- HCM systems typically have high availability and strong SLAs. Batch sync only wins when there are performance issues, rate limiting, or API pricing constraints — none of which apply in v1.
- Time-off requests are lower-volume by nature. Employees do not submit requests at the frequency or concurrency that would stress a synchronous HCM integration.
- This is the right v1 starting point. Track metrics (user sentiment, HCM API performance) before introducing more complex patterns.
