# Background Jobs

## Reconciliation Worker

The reconciliation worker syncs stream statuses and accruals with Streamflow.

### Simple Worker (Default)

`reconcile-simple.ts` - No Redis dependency, uses `setInterval` for scheduling.

**Usage:**
```bash
pnpm worker:reconcile
```

**Features:**
- Runs every 5 minutes
- Processes all active/paused streams sequentially
- Updates stream statuses and `lastSyncedAt`
- Creates notifications for anomalies

### BullMQ Worker (Production)

`reconcile.ts` - Uses BullMQ with Redis for job queue management.

**Requirements:**
- Redis instance (local or Upstash)
- Environment variables:
  - `REDIS_HOST` (default: localhost)
  - `REDIS_PORT` (default: 6379)
  - `REDIS_PASSWORD` (optional)

**Usage:**
```bash
# Update package.json script to use reconcile.ts instead
pnpm worker:reconcile
```

**Features:**
- Job queue with Redis persistence
- Concurrent processing (5 streams at a time)
- Job retry and failure handling
- Better scalability for production

### Anomaly Detection

The worker detects and notifies on:
- Status mismatches (local vs remote)
- Streams paused remotely
- Streams cancelled remotely
- Streams completed
- Insufficient funds (future enhancement)

### Running in Development

**Option 1: Use concurrently (recommended)**
```bash
pnpm dev:all
```

**Option 2: Separate terminals**
```bash
# Terminal 1
pnpm dev

# Terminal 2
pnpm worker:reconcile
```

