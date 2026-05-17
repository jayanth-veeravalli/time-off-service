# Time-Off Service

A NestJS microservice for managing employee time-off requests. Employees submit requests, managers approve or reject them, and the service keeps leave balances in sync with an external HCM system (Workday or SAP). A scheduler automatically cancels requests whose start date has passed without a decision.

**Design docs:** [TRD](docs/TRD.md) · [Alternatives Considered](docs/ALTERNATIVES.md) · [Test Plan](docs/TEST-PLAN.md)

---

## Stack

| Layer | Choice |
|---|---|
| Framework | NestJS 11 (Express) |
| Language | TypeScript 5 (strict) |
| Database | SQLite via TypeORM (better-sqlite3) |
| HCM integration | HTTP adapter (Workday + SAP) |
| Scheduler | `@nestjs/schedule` cron jobs |
| Tests | Jest 30 — unit / integration / e2e |

---

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/requests` | Submit a time-off request |
| `GET` | `/requests` | List requests (filter by employee, status, date) |
| `GET` | `/requests/:externalId` | Get a single request |
| `POST` | `/requests/:externalId/approve` | Approve (manager only) |
| `POST` | `/requests/:externalId/reject` | Reject (manager only) |
| `POST` | `/requests/:externalId/withdraw` | Withdraw (employee) |
| `PATCH` | `/requests/:externalId/manager` | Reassign manager (PENDING only) |
| `POST` | `/requests/:externalId/comments` | Add a comment |
| `GET` | `/requests/:externalId/comments` | List comments |
| `GET` | `/employees/:employeeId/balance` | Fetch HCM leave balance |

---

## Getting started

**Prerequisites:** Node.js 20+, pnpm

```bash
pnpm install
```

### Run

```bash
# development (watch mode)
pnpm start:dev

# production
pnpm build && pnpm start:prod
```

### Database migrations

Migrations run automatically on startup. To run them manually:

```bash
pnpm migration:run
```

---

## Testing

The suite has three projects — unit, integration, and e2e — all run in band to avoid SQLite contention.

```bash
# all suites
pnpm test

# individual suites
pnpm test:unit
pnpm test:integration
pnpm test:e2e

# watch mode (unit only)
pnpm test:watch

# with coverage report
pnpm test:cov
```

Integration and e2e tests spin up a real in-memory SQLite database and an HTTP mock server that simulates the HCM system. No mocking of `dataSource` or HTTP clients.

---

## Project structure

```
src/
├── balance/          # GET /employees/:id/balance
├── comments/         # Comments sub-resource
├── common/           # ClockService, UuidService, HttpExceptionFilter, types, exceptions
├── database/         # TypeORM DataSource config + migrations
├── hcm/              # HCM adapter factory (Workday / SAP)
├── notifications/    # NotificationsService stub
├── requests/         # Core domain — submit, approve, reject, withdraw, list
├── scheduler/        # Cancellation + reminder cron jobs
└── main.ts

test/
├── unit/             # Pure service/factory tests, no DB
├── integration/      # Full DB + mock HCM server, no real HTTP server
├── e2e/              # Full stack — real HTTP server + mock HCM
├── helpers/          # Shared factories, mocks, clock/uuid helpers
└── mocks/            # HCM mock server (Express, stateful)
```

---

## Lint

```bash
pnpm lint
```

ESLint with `typescript-eslint` strict rules. Auto-fix enabled.
