/**
 * Simple Reconciliation Worker (No Redis dependency)
 * Alternative implementation using setInterval for development
 * Use this if you don't have Redis running locally
 */

import { db } from '../db';
import { createStreamflowClient } from '../streamflow';
import { sendNotification } from '../notify';
import { env } from '@/lib/env';
import './worker-health';

/**
 * Reconciliation job processor
 */
async function reconcileStream(streamId: string) {
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

    // Get stream details from Streamflow using polling
    // Note: Streamflow does not provide webhooks, so we poll via getOne
    const streamflowClient = createStreamflowClient({
      clusterUrl: env.SOLANA_CLUSTER_URL,
      cluster: env.SOLANA_CLUSTER,
    });

    const streamflowDetails = await streamflowClient.getOne(stream.streamflowStreamId);

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
    if (anomalies.length > 0) {
      for (const anomaly of anomalies) {
        try {
          await sendNotification({
            organizationId: stream.employee.organizationId,
            userId: stream.employee.userId || undefined,
            type: 'ANOMALY',
            payload: {
              title: `Anomaly Detected: ${anomaly}`,
              message: `Reconciliation detected an anomaly for stream ${stream.streamflowStreamId}: ${anomaly}`,
              data: {
                streamId: stream.id,
                streamflowStreamId: stream.streamflowStreamId,
                anomaly,
                status: streamflowDetails.status,
                availableAmount: streamflowDetails.availableAmount,
                withdrawnAmount: streamflowDetails.withdrawnAmount,
              },
            },
          });
        } catch (error) {
          console.error(`[Reconcile] Failed to send anomaly notification:`, error);
          // Continue with other anomalies
        }
      }

      console.log(`[Reconcile] Sent ${anomalies.length} anomaly notifications for stream ${streamId}`);
    }

    console.log(`[Reconcile] Successfully reconciled stream ${streamId}`);
  } catch (error) {
    console.error(`[Reconcile] Error processing stream ${streamId}:`, error);
  }
}

/**
 * Main reconciliation function
 */
async function runReconciliation() {
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

    // Process streams sequentially (or in batches)
    for (const stream of streams) {
      await reconcileStream(stream.id);
      // Small delay to avoid overwhelming the API
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`[Reconcile] Completed reconciliation of ${streams.length} streams`);
  } catch (error) {
    console.error('[Reconcile] Error during reconciliation:', error);
  }
}

/**
 * Start reconciliation worker
 */
async function startWorker() {
  console.log('[Reconcile] Starting simple reconciliation worker...');

  // Start health check server (runs in background)
  // The health server is imported and starts automatically

  // Run reconciliation every 10 minutes
  // Note: Since Streamflow does not provide webhooks, we poll for updates
  // Adjust interval based on your needs (10 minutes is a reasonable default)
  const RECONCILE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

  // Initial reconciliation
  await runReconciliation();

  // Schedule periodic reconciliation
  const interval = setInterval(async () => {
    await runReconciliation();
  }, RECONCILE_INTERVAL_MS);

  console.log(`[Reconcile] Worker started. Reconciliation interval: ${RECONCILE_INTERVAL_MS / 1000}s`);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[Reconcile] Shutting down worker...');
    clearInterval(interval);
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('[Reconcile] Shutting down worker...');
    clearInterval(interval);
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

export { startWorker, runReconciliation, reconcileStream };

