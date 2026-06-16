# Streamflow Office Payroll

A modern crypto payroll management system built with Next.js 15.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + TypeScript
- **Styling**: Tailwind CSS
- **Database**: Prisma + PostgreSQL
- **Validation**: Zod
- **Data Fetching**: TanStack Query
- **State Management**: Zustand
- **Icons**: Lucide React
- **Date Utilities**: date-fns
- **Code Quality**: ESLint + Prettier
- **Git Hooks**: Husky + Commitlint
- **Environment**: dotenv-safe

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 8+
- PostgreSQL database

### Installation

1. Install dependencies:

```bash
pnpm install
```

2. Set up environment variables:

```bash
cp .env.example .env
```

3. **Configure required environment variables** in `.env`:
   - `DATABASE_URL` - PostgreSQL connection string
   - `NEXTAUTH_URL` - Your application URL (e.g., `http://localhost:3000`)
   - `NEXTAUTH_SECRET` - Secret key for NextAuth (minimum 32 characters)
   - `JWT_SECRET` - Secret key for JWT tokens (minimum 32 characters)
   - `SOLANA_CLUSTER` - Solana cluster (`mainnet-beta`, `devnet`, or `testnet`)
   - `STREAMFLOW_API_BASE` - Streamflow API base URL
   - `STREAMFLOW_WEBHOOK_SECRET` - Secret for Streamflow webhook verification
   - `APP_BASE_URL` - Base URL of your application
   - `ENCRYPTION_KEY_32B` - 32-byte encryption key (base64 encoded)
     - Generate with: `openssl rand -base64 32`
   - `NEXT_PUBLIC_WALLET_ALLOW_MOCK` - (Optional) Set to `true` to enable Mock wallet provider in production
     - Default: Only available in development mode
     - Use this flag to enable mock wallet for testing in production environments
   - `STREAMFLOW_ENABLED` - (Optional) Set to `true` to enable real Streamflow API calls
     - Default: Uses MockStreamflowClient in development
     - When `true`, makes real on-chain API calls to Streamflow
     - Required for production deployments

   **Note**: The application will fail to start if any required environment variable is missing. `dotenv-safe` validates all required variables on startup.

4. Set up the database:

```bash
# Generate Prisma Client first
pnpm prisma:generate

# Create and run migrations
pnpm prisma:migrate --name init

# (Optional) Seed the database with demo data
pnpm prisma:seed
```

5. Run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Running with Background Workers

The application includes a reconciliation worker that syncs stream statuses with Streamflow. To run both the Next.js app and the worker together:

```bash
pnpm dev:all
```

This uses `concurrently` to run both processes. Alternatively, run them separately:

**Terminal 1:**

```bash
pnpm dev
```

**Terminal 2:**

```bash
pnpm worker:reconcile
```

The reconciliation worker:

- Runs every 5 minutes
- Syncs all active/paused streams with Streamflow
- Updates stream statuses and `lastSyncedAt` timestamps
- Creates audit logs for anomalies (paused remotely, cancelled, completed, etc.)

**Note:** In MOCK mode, the worker uses the MockStreamflowClient, so it will work without actual blockchain connections.

### Environment Validation

The project uses `dotenv-safe` to ensure all required environment variables are present. If any required variable is missing, the application will throw an error with a list of missing variables.

**Required Environment Variables:**

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `JWT_SECRET`
- `SOLANA_CLUSTER`
- `STREAMFLOW_API_BASE`
- `STREAMFLOW_WEBHOOK_SECRET`
- `APP_BASE_URL`
- `ENCRYPTION_KEY_32B`

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm dev:all` - Start development server + reconciliation worker (uses concurrently)
- `pnpm build` - Build for production
- `pnpm start` - Start production server (Next.js)
- `pnpm worker:reconcile` - Run reconciliation worker (background job)
- `pnpm lint` - Run ESLint
- `pnpm format` - Format code with Prettier
- `pnpm format:check` - Check code formatting
- `pnpm type-check` - Run TypeScript type checking
- `pnpm prisma:generate` - Generate Prisma Client
- `pnpm prisma:migrate` - Run database migrations
- `pnpm prisma:studio` - Open Prisma Studio
- `pnpm worker:reconcile` - Run reconciliation worker (background job)
- `pnpm test` - Run unit tests (Vitest)
- `pnpm test:watch` - Run unit tests in watch mode
- `pnpm test:coverage` - Run unit tests with coverage
- `pnpm test:e2e` - Run E2E tests (Playwright)
- `pnpm test:e2e:ui` - Run E2E tests with UI

## Testing

### Unit Tests

Unit tests are written with Vitest and cover:

- RBAC middleware and guards
- Streamflow mock client
- Budget rules and enforcement
- Environment variable validation
- Crypto utilities

Run unit tests:

```bash
pnpm test
```

### E2E Tests

End-to-end tests are written with Playwright and cover:

- Authentication flow
- Wallet linking (mock)
- Payroll flow (create employee, contract, approval, stream)
- Dashboard metrics

Run E2E tests:

```bash
pnpm test:e2e
```

**Note:** E2E tests require the development server to be running. The Playwright config will automatically start the server if not already running.

## CI/CD

GitHub Actions CI workflow runs on every push and PR:

- Lint check
- Type checking
- Unit tests
- E2E tests (headless)

See `.github/workflows/ci.yml` for details.

## Deployment

### Quick Start with Docker Compose

```bash
# 1. Copy production environment file
cp .env.production.example .env

# 2. Edit .env with your production values
# IMPORTANT: Generate new secrets for production!

# 3. Start all services
docker compose up -d

# 4. Run database migrations
docker compose exec app pnpm prisma migrate deploy
```

### Deployment Options

- **Single VM/Server**: Recommended for small to medium scale. See `DEPLOYMENT.md` for detailed instructions.
- **Container Platform**: Deploy Docker Compose setup to Kubernetes, Docker Swarm, etc.
- **Serverless/Platform-as-a-Service**: Deploy app to Vercel/Railway/Render, run worker separately.

### Health Checks

- **App**: `GET /api/health` - Returns `{ ok: true, version: "0.1.0" }`
- **Worker**: `GET /api/health/worker` - Returns `{ ok: true, service: "reconciliation-worker" }`

See `DEPLOYMENT.md` for comprehensive deployment guide, including:

- Production environment setup
- Security best practices
- Worker alternatives (Docker, cron, serverless)
- Monitoring and troubleshooting
- Scaling recommendations

## Project Structure

```
├── app/                    # Next.js App Router
│   ├── (app)/             # Authenticated app routes
│   ├── (auth)/            # Authentication routes
│   ├── (public)/          # Public routes
│   ├── api/               # API Route Handlers
│   └── ...
├── components/            # React components
├── lib/                  # Utilities, helpers, RBAC, crypto
├── server/               # Server-side services, DB, workflows, webhooks
├── styles/               # Global styles
├── types/                # TypeScript type definitions
├── prisma/               # Prisma schema and migrations
└── scripts/              # Utility scripts (seed, migrations)
```

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Commit messages should follow the format:

```
<type>(<scope>): <subject>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

## How to Test on Solana Devnet

This guide walks you through testing the full payroll flow on Solana devnet with real Phantom wallet integration.

### Prerequisites

1. **Phantom Wallet Extension**: Install [Phantom](https://phantom.app/) browser extension
2. **Devnet SOL**: Get free devnet SOL from a faucet:
   - [Solana Faucet](https://faucet.solana.com/)
   - [SolFaucet](https://solfaucet.com/)

### Setup Steps

1. **Configure Environment for Devnet**:

   ```bash
   # In your .env file, ensure:
   SOLANA_CLUSTER=devnet
   SOLANA_CLUSTER_URL=https://api.devnet.solana.com
   STREAMFLOW_ENABLED=true
   WALLET_ALLOW_MOCK=false
   ```

2. **Start the Application**:

   ```bash
   # Terminal 1: Start Next.js app
   pnpm dev

   # Terminal 2: Start reconciliation worker
   pnpm worker:reconcile
   ```

3. **Configure Phantom Wallet**:
   - Open Phantom extension
   - Click the network selector (top right)
   - Select **"Devnet"** or **"Testnet"**
   - Ensure you have some devnet SOL (request from faucet if needed)

4. **Test the Full Flow**:

   **Step 1: Sign In**
   - Navigate to `http://localhost:3000/signin`
   - Sign in with any email (demo mode creates user if needed)
   - Ensure you have appropriate permissions (FINANCE_ADMIN, MANAGER, etc.)

   **Step 2: Connect Phantom Wallet**
   - Click "Connect Wallet" button
   - Select "Phantom (Solana Devnet)"
   - Approve connection in Phantom popup
   - Verify your wallet address is displayed

   **Step 3: Create Employee** (HR role)
   - Navigate to `/employees`
   - Create a new employee
   - Link their wallet address (or use a test wallet)

   **Step 4: Create Contract** (HR role)
   - Navigate to `/contracts`
   - Fill in contract details:
     - Select employee
     - Token: SOL (native) or specify token mint
     - Amount per period
     - Period: Monthly/Weekly/Biweekly
     - Start/End dates
   - Click "Create Contract"
   - If wallet address is provided, sign the transaction in Phantom
   - Verify transaction appears on [Solana Explorer](https://explorer.solana.com/?cluster=devnet)

   **Step 5: Request Approval** (HR role)
   - Navigate to `/approvals`
   - Request approval for the contract
   - Select approver (Manager role)

   **Step 6: Approve Contract** (Manager role)
   - Sign in as a user with MANAGER role
   - Navigate to `/approvals`
   - Approve the contract

   **Step 7: Request Funding Approval** (Finance Admin)
   - Sign in as FINANCE_ADMIN
   - Request funding approval for the stream

   **Step 8: Approve Funding** (Manager)
   - Approve the funding request

   **Step 9: Create Stream** (Finance Admin)
   - Navigate to `/contracts` or `/streams`
   - Select the approved contract
   - Click "Create Stream"
   - **Important**: This will open Phantom and prompt you to sign a transaction
   - The transaction creates a real Streamflow stream on devnet
   - After signing, verify:
     - Stream appears in `/streams` page
     - Transaction is visible on [Solana Explorer](https://explorer.solana.com/?cluster=devnet)
     - Click "View on Explorer" link to see the transaction

   **Step 10: Verify on Explorer**
   - Click the "View on Explorer" link next to any stream
   - Verify the transaction exists on Solana Explorer
   - Check that the stream is indexed by Streamflow

   **Step 11: Monitor Reconciliation**
   - The reconciliation worker runs every 10 minutes
   - It syncs stream status from Streamflow SDK
   - Check `/streams` page for updated statuses

### Troubleshooting

**Phantom Not Connecting**:

- Ensure Phantom is installed and unlocked
- Check that Phantom is set to Devnet/Testnet mode
- Refresh the page and try again

**Transaction Fails**:

- Ensure you have enough devnet SOL for transaction fees
- Check Phantom is on the correct network (Devnet)
- Verify the RPC endpoint is accessible

**Stream Not Appearing**:

- Wait a few seconds for transaction confirmation
- Check Solana Explorer to verify transaction was successful
- Refresh the streams page

**Reconciliation Not Working**:

- Ensure the worker is running: `pnpm worker:reconcile`
- Check worker logs for errors
- Verify `STREAMFLOW_ENABLED=true` in `.env`

### Important Notes

- **All transactions are REAL** on Solana devnet - they consume devnet SOL
- **No fake balances** - all balances come from Solana RPC
- **No mock streams** - all streams are created via Streamflow SDK
- **Explorer links** - Every on-chain transaction has a link to Solana Explorer
- **Devnet badge** - The app shows "Solana Devnet (Testnet Mode)" badge when on devnet

### Next Steps

Once you've verified the flow works on devnet:

1. Test with multiple employees and contracts
2. Test stream cancellation
3. Test withdrawal (if recipient wallet is connected)
4. Monitor reconciliation job for status updates
5. Review audit logs for all actions

## License

Private

#   s t r - f y p 
 
 
