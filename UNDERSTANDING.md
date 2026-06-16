# UNDERSTANDING.md

> A plain-English guide to this codebase for a developer joining the team today.
> Everything here is derived from the actual code, not assumptions. Where the code
> is unclear or incomplete, it is called out honestly.

---

## 1. What This Project Does

This is a **crypto payroll system**. A company (an "organization") uses it to pay employees in
Solana-based tokens (like SOL) using **payment streams** instead of one-off transfers — money
"drips" to the employee continuously over time rather than landing all at once.

The people who use it are **finance teams, HR, and managers** inside a company, plus the
**employees** who receive the money. It solves the problem of running on-chain payroll safely:
it adds approvals, budgets, role-based permissions, audit trails, and reporting on top of raw
blockchain payments — things a plain crypto wallet doesn't give you.

The actual on-chain streaming is handled by **Streamflow** (a Solana protocol for token vesting/streaming),
and users sign transactions with their **Phantom wallet** in the browser.

---

## 2. Tech Stack

- **Next.js 15 (App Router)** — one framework for both the UI pages and the backend API routes, so frontend and backend live in the same project.
- **React 19** — builds the interactive dashboard, forms, and tables.
- **TypeScript (strict)** — catches type errors before runtime; the whole codebase is typed.
- **Prisma + PostgreSQL** — the data (users, contracts, streams, budgets) is highly relational, so a SQL database with a type-safe ORM fits well.
- **Zod** — validates every incoming API payload and environment variables so bad data never reaches the database.
- **jose** — creates and verifies the JWT session tokens stored in cookies (works in the Edge/serverless runtime).
- **@streamflow/stream SDK** — does the real work of creating/cancelling/withdrawing on-chain payment streams on Solana.
- **@solana/web3.js** — low-level Solana operations (building transactions, requesting devnet airdrops, reading balances).
- **@solana/wallet-adapter-phantom + tweetnacl + bs58** — connect to the Phantom browser wallet and handle Solana key/signature encoding.
- **TanStack Query** — caches and fetches server data on the client (listed as the data-fetching layer).
- **Zustand** — lightweight client state for the connected wallet and toast notifications.
- **Tailwind CSS + lucide-react + recharts** — styling, icons, and the burn-rate charts on the dashboard.
- **pdfmake** — generates downloadable PDF audit/monthly reports.
- **date-fns** — date math for dashboard metrics and report periods.
- **bullmq + ioredis** — listed for background-job queuing with Redis (the simpler worker actually used runs on `setInterval`, see Section 9).
- **dotenv-safe** — refuses to start the app if a required environment variable is missing.
- **Vitest** — unit tests (RBAC, budget rules, crypto, env, Streamflow mock).
- **Playwright** — end-to-end browser tests (auth, wallet, payroll flow, dashboard).
- **ESLint + Prettier + Husky + Commitlint** — code quality and enforced Conventional Commits on every commit.
- **Docker / docker-compose** — containerized deployment of the app + worker + database.

---

## 3. Project Structure Overview

- **`app/`** — Next.js App Router. Holds both the visible web pages and the backend API.
  - **`app/(app)/`** — the authenticated app (dashboard, streams, contracts, employees, approvals, audit, settings). The layout here redirects to `/signin` if you're not logged in.
  - **`app/(auth)/`** — the sign-in page and its form.
  - **`app/(public)/`** — public-facing routes (minimal).
  - **`app/api/`** — all backend endpoints (auth, streams, contracts, approvals, budgets, wallets, audit, etc.). Each folder is a route.
- **`server/`** — server-only business logic, kept out of the browser bundle.
  - `server/db.ts` — the shared Prisma client instance.
  - `server/auth/` — JWT session creation/verification and audit-log writing.
  - `server/streamflow/` — the wrapper around the Streamflow SDK (real client + a mock client) and the wallet adapter bridge.
  - `server/finance/budget.ts` — budget calculation and "can we commit this much?" enforcement.
  - `server/contracts/create-onchain.ts` — builds a Solana memo transaction that records a contract on-chain.
  - `server/audit/pdf-generator.ts` — builds the monthly PDF reports.
  - `server/jobs/` — the background reconciliation worker that keeps stream statuses in sync.
  - `server/wallet/get-balance.ts` — reads a wallet's SOL balance from the chain.
- **`lib/`** — shared helpers usable on both client and server.
  - `lib/env.ts` — loads + validates environment variables (the single source of config truth).
  - `lib/rbac.ts` — the permission-checking engine.
  - `lib/auth.ts` — `getSession` / `requireAuth` helpers.
  - `lib/middleware/` — reusable API wrappers: `rbac-guard` (auth + permissions), `csrf`, `rate-limit`, `security`.
  - `lib/crypto.ts` — AES-256-GCM encryption, SHA-256 hashing, secure token generation.
  - `lib/wallet/` — the browser wallet abstraction (Phantom, Solflare, MetaMask Snap, Mock) and its Zustand store.
  - `lib/streamflow/browser-client.ts` — creates streams directly from the browser with the connected wallet.
  - `lib/hooks/usePermissions.ts` — React hook to check the current user's permissions in the UI.
- **`types/`** — shared TypeScript types, including `types/rbac.ts` which lists every permission and role key.
- **`prisma/`** — `schema.prisma` (the database definition) and `seed.ts` (creates demo org, roles, permissions, users).
- **`components/`** — reusable UI (Sidebar, Header, DataTable, KPIGrid, StatCard, ConfirmDialog, toasts, wallet button).
- **`middleware.ts`** — runs on every page request to attach security headers (CSP, HSTS, etc.).
- **`e2e/`** — Playwright end-to-end tests. **`scripts/`** — utility scripts. Root config files for Docker, ESLint, Tailwind, TS, CI.

---

## 4. How Data Flows (Main Flows)

### Flow: Sign In (email)

1. User submits email to `POST /api/auth/signin`.
2. The request first passes through **rate limiting** (5 attempts per 15 min) and **CSRF** protection.
3. The user is found or created (demo mode) and attached to their existing org, or to the first org with the default `EMPLOYEE` role.
4. A **JWT session token** (24h) and **refresh token** (7d) are created and stored as HttpOnly cookies.
5. A `LOGIN` audit log is written, and the browser is now authenticated for all future requests via the cookie.

### Flow: Sign In with Google

1. User clicks Google sign-in → `GET /api/auth/google` redirects to Google's consent screen.
2. Google redirects back to `GET /api/auth/google/callback` with a code.
3. The server exchanges the code for an access token, fetches the Google profile (email + name).
4. Same user/org/role resolution as email sign-in.
5. Session cookies are attached to the redirect response and the user lands on `/settings/wallets`.

### Flow: Linking a Wallet

1. Employee/admin connects Phantom in the browser, then calls `POST /api/wallets/link` with the address + provider.
2. The server checks the wallet isn't already linked for this user+org.
3. It saves the wallet; **the first wallet a user links automatically becomes their `isPrimary` wallet**.
4. A `WALLET_LINKED` audit log is written. The primary wallet is what payroll streams pay into / pay from.

### Flow: Creating a Contract (HR)

1. HR submits employee + token + rate + period + dates to `POST /api/contracts` (needs `MANAGE_EMPLOYEES`).
2. The server validates the employee belongs to the org and stores the contract (amount stored as a high-precision `Decimal`).
3. A `CREATE / CONTRACT` audit log is written.
4. If a wallet address was supplied, the server builds an on-chain **memo transaction** (contract metadata) and returns it serialized for the client to sign — making the contract visible on Solana Explorer.

### Flow: The Approval Chain (the gate before money moves)

1. HR/Manager requests approval via `POST /api/approvals/request` with `subjectType` (`CONTRACT` or `STREAM`) and the subject's id (needs `APPROVE_PAYROLL`).
2. An `Approval` row is created with status `PENDING`.
3. A Manager reviews `/approvals` and calls `POST /api/approvals/approve` with the approval id (needs `APPROVE_PAYROLL`).
4. The approval flips to `APPROVED`, recording who approved it and when, plus an `APPROVE` audit log.
5. A contract needs **two** approvals before a stream can be created: a `CONTRACT` approval **and** a `STREAM` (funding) approval (see Section 8).

### Flow: Creating a Payment Stream (the core flow)

1. Finance Admin opens `/streams/create`. The page calls `GET /api/contracts?eligibleForStream=true`, which only returns contracts that are approved, funding-approved, and don't already have a stream.
2. They pick a contract, set start/end/cliff dates, and click **"Create with Phantom"**.
3. The browser (`lib/streamflow/browser-client.ts`) builds and sends the real Streamflow transaction; **Phantom pops up and the user signs it on-chain**.
4. The resulting `streamflowStreamId` + transaction signature are POSTed to `POST /api/streams/create` (needs `CREATE_STREAM`).
5. The server re-verifies: contract is approved, funding is approved, employee has a primary wallet, and the **budget cap isn't exceeded** (if the employee is in a department with a budget).
6. It saves the `Stream` row (status `ACTIVE`) and writes a `STREAM_CREATED` audit log.

### Flow: Reconciliation (keeping streams honest)

1. A separate worker process (`pnpm worker:reconcile`) runs `runReconciliation()` every 10 minutes.
2. It loads all `ACTIVE`/`PAUSED` streams and, for each, polls Streamflow with `getOne()` (Streamflow has no webhooks, so it polls).
3. It compares the on-chain status to the database status and records **anomalies** (paused remotely, cancelled remotely, completed).
4. It updates the stream's status + `lastSyncedAt`, and logs any anomalies found.

### Flow: Employee Withdrawing Their Pay

1. The employee performs the actual on-chain withdrawal in the browser via their wallet.
2. They then call `POST /api/streams/withdraw` to record it for the audit trail.
3. The server confirms **only the stream's own recipient** (matching `userId`) can record the withdrawal, then writes a `STREAM_WITHDRAW` audit log. (This endpoint only records; it does not move funds.)

---

## 5. Database / Schema Explained

The schema is in `prisma/schema.prisma`, PostgreSQL. Almost everything is scoped to an
`Organization` (multi-tenant). Token amounts use `Decimal(20,8)` for precision.

- **Organization** — the company/tenant. Everything (users' roles, employees, contracts, streams, budgets, audit logs) hangs off it. Has a unique `slug`.
- **User** — a login account (`email` unique). A user can belong to multiple orgs through `UserRole`, can link wallets, and can be the actor on audit logs.
- **Wallet** — a Solana wallet linked to a user within an org. Stores `address`, `provider` (phantom/solflare/etc.), `network` (devnet/mainnet), and `isPrimary`. Unique per `(user, org, address)`.
- **Role** — a named role (`key` like `FINANCE_ADMIN`, `MANAGER`). Connected to permissions via `RolePermission`.
- **Permission** — a single capability (`key` like `CREATE_STREAM`).
- **RolePermission** — the many-to-many join: which permissions a role grants.
- **UserRole** — assigns a user a role inside a specific organization (this is how access is granted).
- **Employee** — a person being paid. Linked to a `User` account via `userId` (created or matched by email on onboarding). Has `status` (ACTIVE/INACTIVE/TERMINATED/ON_LEAVE) and start/end dates. Belongs to an org.
- **Contract** — the payroll agreement for an employee: which `tokenMint`/`tokenSymbol`, `rateType` (SALARY/HOURLY/MILESTONE), `amountPerPeriod`, `period` (MONTHLY/WEEKLY/BIWEEKLY/ONE_TIME), dates, and an optional `onchainTx`. One employee can have many contracts.
- **Approval** — a generic approval record. `subjectType` ("CONTRACT"/"STREAM"/"BUDGET") + `subjectId` point at what's being approved. Has a `step` (for multi-step chains), a `status` (PENDING/APPROVED/REJECTED/CANCELLED), and who approved it.
- **Stream** — an actual on-chain payment stream. Links org + employee + contract. Stores `totalAmount`, start/end/cliff times, the `streamflowStreamId` (unique, the on-chain stream), `onchainTx`, `status` (PENDING/ACTIVE/PAUSED/COMPLETED/CANCELLED), and `lastSyncedAt` (when reconciliation last checked it).
- **AuditLog** — an immutable trail of actions. Records `actor`, `action`, `entity`+`entityId`, `before`/`after` JSON snapshots, request `ip`/`userAgent`, and a SHA-256 `hash` of the entry for tamper-evidence.
- **Budget** — a spending cap for a token in an org: `capAmount` and `currentCommitted`. Linked to departments via `DepartmentBudget`.
- **Department** — an org sub-group. Has members (`DepartmentMember`) and budgets (`DepartmentBudget`).
- **DepartmentMember** — links a user to a department (unique per pair).
- **DepartmentBudget** — links a department to a budget (unique per pair). This is how budget caps apply to a group of employees.
- **WebhookEvent** — stores incoming Streamflow webhook events (`eventId` unique for deduplication, `processed` flag). Present in the schema for webhook handling, though reconciliation currently relies on polling (see Section 9).
- **AuditReport** — a generated PDF report record: `reportType` (MONTHLY/CUSTOM), the period, file name/path/size, and a SHA-256 `hash` of the file.

---

## 6. API Routes Reference

All routes live under `app/api/`. "Authenticated" = any logged-in user. "Permission: X" means the
`withAuthAndRBAC` guard requires that permission (which maps to specific roles — see Section 7).

### Auth

- `POST /api/auth/signin` — Email sign-in. **Public** (rate-limited + CSRF-protected).
- `GET /api/auth/google` — Start Google OAuth. **Public**.
- `GET /api/auth/google/callback` — Google OAuth callback, creates session. **Public**.
- `POST /api/auth/signout` — Log out / destroy session. **Authenticated**.
- `GET /api/csrf-token` — Get a CSRF token for the client. **Public**.

### Me (current user)

- `GET /api/me/permissions` — List my permissions. **Authenticated** (no specific permission).
- `GET /api/me/streams` — List streams where I am the recipient. **Permission: VIEW_SELF_STREAMS**.

### Employees & Contracts

- `GET /api/employees` — List employees. **Permission: VIEW_FINANCE_DASHBOARD or MANAGE_EMPLOYEES**.
- `POST /api/employees` — Create an employee (requires email; optionally links a primary wallet). **Permission: MANAGE_EMPLOYEES**.
- `GET /api/contracts` — List contracts (supports `?eligibleForStream=true`). **Permission: VIEW_FINANCE_DASHBOARD or MANAGE_EMPLOYEES**.
- `POST /api/contracts` — Create a contract. **Permission: MANAGE_EMPLOYEES**.
- `POST /api/contracts/[id]/onchain` — Attach an on-chain tx signature to a contract. **Permission: MANAGE_EMPLOYEES**.

### Approvals

- `GET /api/approvals` — List approvals. **Authenticated** (no specific permission).
- `POST /api/approvals/request` — Request approval for a contract/stream. **Permission: APPROVE_PAYROLL**.
- `POST /api/approvals/approve` — Approve a pending request. **Permission: APPROVE_PAYROLL**.

### Streams

- `GET /api/streams` — List org streams. **Permission: VIEW_SELF_STREAMS**.
- `GET /api/streams/[id]` — Get one stream. **Permission: VIEW_FINANCE_DASHBOARD**.
- `POST /api/streams/create` — Record/create a new stream. **Permission: CREATE_STREAM**.
- `POST /api/streams/pause` — Pause a stream (local status). **Permission: PAUSE_STREAM**.
- `POST /api/streams/cancel` — Cancel a stream on-chain. **Permission: CANCEL_STREAM**.
- `POST /api/streams/withdraw` — Record a withdrawal (recipient only). **Authenticated** (recipient validated in handler).

### Budgets

- `GET /api/budgets` — List budgets. **Permission: VIEW_BUDGET or VIEW_FINANCE_DASHBOARD**.
- `POST /api/budgets` — Create a budget. **Permission: MANAGE_BUDGET**.
- `GET /api/budgets/[id]` — Get a budget. **Permission: VIEW_FINANCE_DASHBOARD**.
- `DELETE /api/budgets/[id]` — Delete a budget. **Permission: MANAGE_BUDGET**.
- `POST /api/budgets/[id]/departments` — Assign a budget to a department. **Permission: MANAGE_BUDGET**.
- `DELETE /api/budgets/[id]/departments` — Unassign a budget from a department. **Permission: MANAGE_BUDGET**.

### Wallets

- `GET /api/wallets/list` — List my wallets. **Authenticated**.
- `POST /api/wallets/link` — Link a wallet. **Authenticated**.
- `POST /api/wallets/unlink` — Unlink a wallet. **Authenticated**.
- `POST /api/wallets/primary` — Set my primary wallet. **Authenticated**.
- `GET /api/wallets/balance` — Read on-chain SOL balance. **Authenticated**.
- `POST /api/wallets/faucet` — Request devnet/testnet airdrop (0.5 SOL, 1 per 5 min). **Authenticated**.

### Finance & Audit

- `GET /api/finance/dashboard` — Dashboard metrics (active streams, monthly payout, burn rate, etc.). **Permission: VIEW_FINANCE_DASHBOARD**.
- `GET /api/audit` — List audit logs. **Permission: VIEW_AUDIT**.
- `GET /api/audit/export/csv` — Export audit logs as CSV. **Permission: VIEW_AUDIT**.
- `GET /api/audit/reports` — List generated reports. **Permission: VIEW_AUDIT**.
- `POST /api/audit/reports/generate` — Generate a monthly/custom PDF report. **Permission: VIEW_AUDIT**.

### Admin / Settings

- `GET /api/users` — List users. **Authenticated**.

### System

- `GET /api/health` — App health check → `{ ok, version }`. **Public**.
- `GET /api/health/worker` — Worker health check. **Public**.
- `GET /api/protected-demo` / `POST /api/protected-demo` — Example showing how the RBAC guard is used. **Permission: VIEW_FINANCE_DASHBOARD / (APPROVE_PAYROLL + CREATE_STREAM)**.

---

## 7. Module by Module Breakdown

### `lib/env.ts` — Configuration gatekeeper

- Loads `.env` via `dotenv-safe`, then re-validates with a Zod schema. Throws on startup if anything required is missing or malformed (e.g. secrets shorter than 32 chars).
- Exports a typed `env` object and convenience flags: `IS_DEVNET`, `STREAMFLOW_ENABLED`, `WALLET_ALLOW_MOCK`, `SOLANA_CLUSTER_URL`, etc.
- Almost every server module imports from here. **Depends on:** dotenv-safe, zod.

### `lib/rbac.ts` + `types/rbac.ts` — Permission engine

- `types/rbac.ts` defines every `PERMISSION_KEYS` and `ROLE_KEYS` constant.
- `getUserPermissions(userId, orgId)` — loads the user's roles in an org and flattens them into a unique set of permission keys.
- `hasPermission` / `hasAnyPermission` / `hasAllPermissions` — boolean checks (OR / AND logic).
- `assertPermission` — throws `PermissionDeniedError` if missing, **and writes a `PERMISSION_DENIED` audit log**.
- **Depends on:** `server/db`, `lib/crypto` (hashing), the audit log.

### `lib/middleware/rbac-guard.ts` — The API protection wrapper

- `withAuthAndRBAC(handler, options)` wraps a route handler. On each request it: (1) requires a valid session, (2) verifies the org still exists, (3) checks the required permission(s), (4) calls your handler with the resolved `session` and route `params`.
- Translates errors into proper HTTP codes: 401 (unauthenticated), 403 (permission denied), 500 (other).
- This is the backbone used by nearly every API route. **Depends on:** `lib/auth`, `lib/rbac`.

### `lib/middleware/csrf.ts` & `rate-limit.ts` & `security.ts`

- **csrf** — double-submit cookie pattern. `withCsrfProtection` wraps handlers (used on sign-in); skips GET/HEAD/OPTIONS.
- **rate-limit** — in-memory store for dev, Upstash Redis for production (auto-selected by env vars). Pre-built limiters: `strict` (5/min), `standard` (20/min), `auth` (5/15min), `api` (100/min).
- **security** — security-related helpers (CSP/header logic also partly in root `middleware.ts`).

### `lib/auth.ts` + `server/auth/session.ts` — Sessions

- `session.ts` issues/verifies JWTs (`jose`), with a 24h session token and 7d refresh token in HttpOnly cookies. `createSession`, `getSession`, `refreshSession`, `destroySession`, plus `issueSessionTokens`/`attachSessionToResponse` for the OAuth redirect case.
- `lib/auth.ts` is the thin public interface: `getSession()` (auto-refreshes if expired) and `requireAuth()` (throws if not logged in).
- **Depends on:** jose, `server/db`, `lib/env`.

### `server/auth/audit.ts` — Audit logging

- `createAuditLog(data)` writes an `AuditLog` row with a SHA-256 integrity hash; **never throws** (logging failure must not break the main flow).
- `getRequestMetadata(request)` pulls `ip` (from `x-forwarded-for`) and `userAgent` for logging.

### `server/streamflow/` — The blockchain bridge

- `client.ts` — defines two implementations of `IStreamflowClient`:
  - **`StreamflowClient`** — the real SDK. Methods: `createStream`, `createMultiple`, `withdraw`, `topup`, `transfer`, `cancelStream`, `getOne`, `get`. `pauseStream`/`resumeStream` **throw** because the SDK doesn't support pausing.
  - **`MockStreamflowClient`** — an in-memory fake that simulates streams (used when `STREAMFLOW_ENABLED` is false). It even computes accrued amounts over time.
  - `createStreamflowClient()` factory picks real vs mock based on env. `getStreamflowClient()` is a singleton for reads. `buildExplorerTxUrl()` makes Solana Explorer links.
- `wallet-adapter.ts` — bridges the app's `ConnectedWallet` to the SDK's expected signer shape. `createStreamflowWalletAdapter` (browser/Phantom signing), `createServerWalletAdapter`/`getServerWalletAdapter` (server keypair from `STREAMFLOW_SENDER_PRIVATE_KEY`), `signDetachedWithKeypair`.
- `types.ts` — the interfaces (`CreateStreamInput`, `StreamDetails`, etc.).

### `server/finance/budget.ts` — Budget rules

- `computeCommitted(org, token)` — sums `totalAmount` of all ACTIVE/PAUSED streams for a token.
- `computeDepartmentCommitted(...)` — same, but scoped to a department's members.
- `canCommit(org, dept, token, amount)` / `canCommitOrganization(...)` — return whether a new amount fits under the cap, with the reason and remaining available if not.
- **Depends on:** `server/db`, Prisma `Decimal`.

### `server/jobs/reconcile-simple.ts` — Background sync worker

- `reconcileStream(id)` — polls Streamflow for one stream, detects anomalies, updates status, logs discrepancies.
- `runReconciliation()` — loops over all ACTIVE/PAUSED streams.
- `startWorker()` — runs reconciliation immediately, then every 10 minutes via `setInterval`; handles graceful shutdown. (`reconcile.ts` is the BullMQ/Redis variant.)

### `lib/wallet/client.ts` — Browser wallet abstraction

- A `WalletRegistry` holding adapters: **Phantom** (primary), **Solflare** (placeholder/not implemented), **MetaMask Solana Snap** (extensive install/permission handling), and **Mock** (dev only, gated by `WALLET_ALLOW_MOCK`).
- Each adapter exposes `connect`/`disconnect`/`isAvailable` and a `ConnectedWallet` with `signMessage`/`signAndSendTransaction`.

### `lib/crypto.ts` — Encryption & hashing

- `encrypt`/`decrypt` (AES-256-GCM using `ENCRYPTION_KEY_32B`), `hash` (SHA-256), `generateSecureToken` (used by CSRF).

### API route modules (`app/api/**`)

- Each is a thin handler: validate input with Zod → enforce business rules → touch the DB → write an audit log → return JSON. They are wrapped by `withAuthAndRBAC` (or rate-limit/CSRF for auth). Detailed list in Section 6.

---

## 8. Key Business Logic

These rules are enforced in code, mostly inside the API handlers:

- **A stream cannot be created until BOTH the contract AND its funding are approved.** `POST /api/streams/create` checks for an `APPROVED` `CONTRACT` approval _and_ an `APPROVED` `STREAM` (step 1, funding) approval before allowing creation.
- **A contract is only "eligible for streaming" if it's approved, funding-approved, and has no existing stream.** `GET /api/contracts?eligibleForStream=true` filters out anything that doesn't meet all three.
- **An employee must have a linked primary wallet before a stream can be created for them.** The create-stream handler returns an error if `employee.user.wallets` (primary) is empty.
- **Budget caps are enforced.** If the employee belongs to a department with a budget, creating a stream calls `canCommit(...)`; if the new total would exceed the cap, the request is rejected with the cap/available numbers.
- **Total stream amount is derived from the contract period.** The server multiplies `amountPerPeriod` by the number of months/weeks/biweeks in the duration (`Math.ceil`) — it does not blindly trust a client-sent total.
- **Only the stream's recipient can record a withdrawal.** `POST /api/streams/withdraw` rejects anyone whose `userId` ≠ the stream employee's `userId`.
- **A completed stream cannot be cancelled; only an active stream can be paused.** Cancel rejects `COMPLETED`; pause rejects anything not `ACTIVE`.
- **The first wallet a user links becomes their primary** automatically; subsequent ones don't.
- **Admin demo users won't be silently given the EMPLOYEE role.** Email sign-in refuses to auto-assign a role to `sysadmin@`/`admin@demo-corp.com`; they must be set up via the seed script.
- **Permission denials are themselves audited.** Every failed permission check writes a `PERMISSION_DENIED` audit log with IP/user-agent.
- **Every audit log and PDF report is hashed (SHA-256)** so tampering can be detected.
- **Role → permission mapping** (from `prisma/seed.ts`): `SYS_ADMIN` = everything; `FINANCE_ADMIN` = stream + payroll + budget + audit; `MANAGER` = approve payroll, manage budgets/employees, create streams; `HR` = manage employees, view dashboard/budget; `EMPLOYEE` = view own streams + dashboard; `AUDITOR` = view audit + dashboard.

---

## 9. Things That Are Tricky or Non-Obvious

- **"Real" vs "Mock" Streamflow is a feature flag.** When `STREAMFLOW_ENABLED=false` (or `USE_MOCK_STREAMFLOW=true`), the app uses `MockStreamflowClient` and no blockchain calls happen. This is easy to forget when debugging "why didn't my stream appear on-chain."
- **Streams are actually created in the BROWSER, not the server.** The real signing happens client-side via Phantom (`lib/streamflow/browser-client.ts`), and the server's `POST /api/streams/create` mostly just _records_ the resulting `streamflowStreamId`/`txId`. The server-side creation path still exists but is effectively deprecated (needs `STREAMFLOW_SENDER_PRIVATE_KEY`).
- **Pause is fake on-chain.** The Streamflow SDK doesn't support pause/resume — `StreamflowClient.pauseStream` throws. The `POST /api/streams/pause` route only updates the **local** database status. So a "PAUSED" stream may still be flowing on-chain.
- **Cancel still uses the SERVER wallet.** Unlike create, `POST /api/streams/cancel` signs with `getServerWalletAdapter()` (the server keypair). This is inconsistent with the client-signed creation flow and is flagged in the code as something to refactor.
- **No real webhooks — it polls.** There's a `WebhookEvent` table and `STREAMFLOW_WEBHOOK_SECRET` in the docs, but Streamflow doesn't send webhooks, so the worker **polls** `getOne()` every 10 minutes. (The README says 5 minutes in one place and 10 in another; the code says 10.)
- **Two reconciliation workers exist.** `reconcile.ts` (BullMQ + Redis) and `reconcile-simple.ts` (plain `setInterval`, no Redis). The `worker:reconcile` script runs the _simple_ one.
- **`funding` approval reuses `subjectType='STREAM'` with `subjectId = contractId`.** This is confusing: the "stream funding" approval is stored against the _contract's_ id before any stream exists. A new dev will look for it under the stream and not find it.
- **Two env example files.** `.env.example` is empty and `env.example` has the real template — but `lib/env.ts` points `dotenv-safe` at `./.env.example`. Make sure your `.env` actually has all required keys regardless.
- **The dashboard burn-rate is an estimate.** `GET /api/finance/dashboard` admits in comments that daily burn is approximated from stream totals/durations, not actual daily spend.
- **Mock wallet is env-gated even on the server.** `lib/wallet/client.ts` registers adapters differently on client vs server and only enables the Mock wallet when `WALLET_ALLOW_MOCK`/`NEXT_PUBLIC_WALLET_ALLOW_MOCK` is `true`.
- **Type assertions around the SDK.** `server/streamflow/client.ts` uses `as any` on the wallet adapter due to a version mismatch between the app's adapter and the SDK's expected type — intentional, but worth knowing.

---

## 10. How To Run This Project

**Prerequisites:** Node.js 20+, pnpm 8+, and a PostgreSQL database. (For real on-chain testing: the Phantom browser extension + devnet SOL.)

### 1. Install dependencies

```bash
pnpm install
```

(`postinstall` runs `prisma generate` automatically.)

### 2. Create your `.env`

Use `env.example` as the template. Required variables (validated on startup by `lib/env.ts`):

- `DATABASE_URL` — PostgreSQL connection string.
- `NEXTAUTH_URL` and `APP_BASE_URL` — your app URL, e.g. `http://localhost:3000`.
- `NEXTAUTH_SECRET` — ≥ 32 chars.
- `JWT_SECRET` — ≥ 32 chars (signs the session cookies).
- `ENCRYPTION_KEY_32B` — base64-encoded 32-byte key. Generate with `openssl rand -base64 32`.
- `SOLANA_CLUSTER` — `devnet`, `testnet`, or `mainnet-beta`.
- `SOLANA_CLUSTER_URL` — the RPC endpoint (e.g. `https://api.devnet.solana.com`).

Useful optional variables:

- `STREAMFLOW_ENABLED=true` — make real on-chain calls (otherwise the mock client is used).
- `WALLET_ALLOW_MOCK` / `NEXT_PUBLIC_WALLET_ALLOW_MOCK` — enable the dev mock wallet.
- `NEXT_PUBLIC_SOLANA_CLUSTER` / `NEXT_PUBLIC_SOLANA_CLUSTER_URL` — client-side Solana config.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — enable Google sign-in.
- `STREAMFLOW_SENDER_PRIVATE_KEY` — only for server-side stream operations (e.g. cancel).
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — enable Redis-backed rate limiting in production.

### 3. Set up the database

```bash
pnpm prisma:generate          # generate the Prisma client
pnpm prisma:migrate --name init   # create + run migrations
pnpm prisma:seed              # (optional) demo org, roles, permissions, users
```

The seed creates `sysadmin@demo-corp.com` (SYS_ADMIN) and `admin@demo-corp.com` (FINANCE_ADMIN), plus a sample employee, contract, budget, and department.

### 4. Run it

```bash
pnpm dev          # app only
# or
pnpm dev:all      # app + reconciliation worker together (via concurrently)
```

Open `http://localhost:3000`. To run the worker separately: `pnpm worker:reconcile`.

### 5. Other useful scripts

- `pnpm build` / `pnpm start` — production build / serve.
- `pnpm lint`, `pnpm format`, `pnpm type-check` — quality checks.
- `pnpm test` (Vitest unit tests), `pnpm test:e2e` (Playwright E2E).
- `pnpm prisma:studio` — visual database browser.

### 6. Docker (production-style)

```bash
cp .env.production.example .env   # then fill in real production secrets
docker compose up -d
docker compose exec app pnpm prisma migrate deploy
```

Health checks: `GET /api/health` (app) and `GET /api/health/worker` (worker). See `DEPLOYMENT.md` for the full guide and `README.md` for a step-by-step Solana devnet walkthrough with Phantom.
