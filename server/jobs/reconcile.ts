/**
 * Stream Reconciliation Worker
 * Background job to sync stream statuses and accruals with Streamflow
 */

import { Worker, Queue } from 'bullmq';
import { db } from '../db';
import { createStreamflowClient } from '../streamflow';
import { env } from '../lib/env';
import type { StreamDetails } from '../streamflow/types';

// Queue configuration
// In production, use Redis connection string from env
// For development, use in-memory or local Redis
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
};

// Create queue
const reconcileQueue = new Queue('stream-reconciliation', { connection });

/**
 * Reconciliation job processor
 */
async function processReconciliation(job: { data: { streamId: string } }) {
  const { streamId } = job.data;

  console.log(`[Reconcile] Processing stream ${streamId}`);

  try {
    // Get stream from database
    const stream = await db.stream.findUnique({
      where: { id: streamId },
      include: {
        employee: {
          select: {
            id: true,
            userId: true,
            organizationId: true,
          },
        },
      },
    });

    if (!stream) {
      console.warn(`[Reconcile] Stream ${streamId} not found in database`);
      return;
    }

    if (!stream.streamflowStreamId) {
      console.warn(`[Reconcile] Stream ${streamId} has no Streamflow stream ID`);
      return;
    }

    // Get stream details from Streamflow
    const streamflowClient = createStreamflowClient({
      apiBase: env.STREAMFLOW_API_BASE,
      cluster: env.SOLANA_CLUSTER,
    });

    const streamflowDetails = await streamflowClient.getStream(stream.streamflowStreamId);

    // Check for anomalies
    const anomalies: string[] = [];

    // Status mismatch
    if (streamflowDetails.status !== stream.status) {
      anomalies.push(
        `Status mismatch: local=${stream.status}, remote=${streamflowDetails.status}`
      );
    }

    // Check if stream was paused remotely
    if (stream.status === 'ACTIVE' && streamflowDetails.status === 'PAUSED') {
      anomalies.push('Stream was paused remotely');
    }

    // Check if stream was cancelled remotely
    if (stream.status === 'ACTIVE' && streamflowDetails.status === 'CANCELLED') {
      anomalies.push('Stream was cancelled remotely');
    }

    // Check if stream completed
    if (streamflowDetails.status === 'COMPLETED' && stream.status !== 'COMPLETED') {
      anomalies.push('Stream completed');
    }

    // Update stream in database
    await db.stream.update({
      where: { id: streamId },
      data: {
        status: streamflowDetails.status as any,
        lastSyncedAt: new Date(),
      },
    });

    // Create notifications for anomalies
    if (anomalies.length > 0 && stream.employee.userId) {
      for (const anomaly of anomalies) {
        await db.notification.create({
          data: {
            organizationId: stream.employee.organizationId,
            userId: stream.employee.userId,
            type: getNotificationTypeForAnomaly(anomaly),
            payload: {
              streamId: stream.id,
              streamflowStreamId: stream.streamflowStreamId,
              anomaly,
              status: streamflowDetails.status,
              availableAmount: streamflowDetails.availableAmount,
              withdrawnAmount: streamflowDetails.withdrawnAmount,
            },
          },
        });
      }

      console.log(`[Reconcile] Created ${anomalies.length} notifications for stream ${streamId}`);
    }

    console.log(`[Reconcile] Successfully reconciled stream ${streamId}`);
  } catch (error) {
    console.error(`[Reconcile] Error processing stream ${streamId}:`, error);
    throw error;
  }
}

/**
 * Get notification type based on anomaly
 */
function getNotificationTypeForAnomaly(anomaly: string): string {
  if (anomaly.includes('paused')) {
    return 'STREAM_UPDATED';
  }
  if (anomaly.includes('cancelled')) {
    return 'STREAM_UPDATED';
  }
  if (anomaly.includes('completed')) {
    return 'STREAM_UPDATED';
  }
  if (anomaly.includes('insufficient funds')) {
    return 'SYSTEM_ALERT';
  }
  return 'SYSTEM_ALERT';
}

/**
 * Main reconciliation function
 * Fetches all active streams and queues them for reconciliation
 */
async function queueReconciliation() {
  console.log('[Reconcile] Starting reconciliation cycle...');

  try {
    // Get all active and paused streams
    const streams = await db.stream.findMany({
      where: {
        status: {
          in: ['ACTIVE', 'PAUSED'],
        },
      },
      select: {
        id: true,
      },
    });

    console.log(`[Reconcile] Found ${streams.length} streams to reconcile`);

    // Queue each stream for reconciliation
    const jobs = streams.map((stream) =>
      reconcileQueue.add('reconcile-stream', { streamId: stream.id })
    );

    await Promise.all(jobs);

    console.log(`[Reconcile] Queued ${streams.length} streams for reconciliation`);
  } catch (error) {
    console.error('[Reconcile] Error queueing reconciliation:', error);
  }
}

/**
 * Worker setup
 */
async function startWorker() {
  console.log('[Reconcile] Starting reconciliation worker...');

  // Create worker
  const worker = new Worker(
    'stream-reconciliation',
    async (job) => {
      return await processReconciliation(job);
    },
    {
      connection,
      concurrency: 5, // Process 5 streams concurrently
      removeOnComplete: {
        count: 100, // Keep last 100 completed jobs
      },
      removeOnFail: {
        count: 1000, // Keep last 1000 failed jobs
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Reconcile] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Reconcile] Job ${job?.id} failed:`, err);
  });

  // Run reconciliation every 5 minutes
  // In production, you might want to use a cron schedule
  const RECONCILE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  // Initial reconciliation
  await queueReconciliation();

  // Schedule periodic reconciliation
  setInterval(async () => {
    await queueReconciliation();
  }, RECONCILE_INTERVAL_MS);

  console.log(`[Reconcile] Worker started. Reconciliation interval: ${RECONCILE_INTERVAL_MS / 1000}s`);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[Reconcile] Shutting down worker...');
    await worker.close();
    await reconcileQueue.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('[Reconcile] Shutting down worker...');
    await worker.close();
    await reconcileQueue.close();
    process.exit(0);
  });
}

// Start worker if run directly
if (require.main === module) {
  startWorker().catch((error) => {
    console.error('[Reconcile] Fatal error:', error);
    process.exit(1);
  });
}

export { startWorker, queueReconciliation, processReconciliation };

