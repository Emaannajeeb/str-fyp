/**
 * Get Stream Detail API
 * GET: Get stream details by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { createStreamflowClient } from '@/server/streamflow';
import { env } from '@/lib/env';
import { StreamStatus } from '@prisma/client';

function toPrismaStreamStatus(value: unknown): StreamStatus {
  if (typeof value !== 'string') return StreamStatus.PENDING;
  switch (value.toUpperCase()) {
    case 'PENDING':
      return StreamStatus.PENDING;
    case 'ACTIVE':
      return StreamStatus.ACTIVE;
    case 'PAUSED':
      return StreamStatus.PAUSED;
    case 'COMPLETED':
      return StreamStatus.COMPLETED;
    case 'CANCELLED':
      return StreamStatus.CANCELLED;
    default:
      return StreamStatus.PENDING;
  }
}

async function getStreamHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string },
  context?: { params?: { id?: string } }
) {
  try {
    const streamId = context?.params?.id;

    if (!streamId) {
      return NextResponse.json({ error: 'Stream ID is required' }, { status: 400 });
    }

    // Get stream from database
    const stream = await db.stream.findFirst({
      where: {
        id: streamId,
        organizationId: session.organizationId,
      },
      include: {
        employee: {
          select: {
            id: true,
            displayName: true,
            userId: true,
          },
        },
        contract: {
          select: {
            id: true,
            tokenSymbol: true,
            amountPerPeriod: true,
            period: true,
            rateType: true,
          },
        },
      },
    });

    if (!stream) {
      return NextResponse.json({ error: 'Stream not found or access denied' }, { status: 404 });
    }

    // If stream has Streamflow ID, sync with Streamflow API via polling
    let streamflowDetails = null;
    if (stream.streamflowStreamId) {
      try {
        const streamflowClient = createStreamflowClient({
          clusterUrl: env.SOLANA_CLUSTER_URL,
          cluster: env.SOLANA_CLUSTER,
        });

        streamflowDetails = await streamflowClient.getOne(stream.streamflowStreamId);

        // Update stream status if changed
        if (streamflowDetails.status !== stream.status) {
          await db.stream.update({
            where: { id: streamId },
            data: {
              status: toPrismaStreamStatus(streamflowDetails.status),
              lastSyncedAt: new Date(),
            },
          });
        }
      } catch (error) {
        console.warn('Failed to sync with Streamflow:', error);
        // Continue with database data if sync fails
      }
    }

    const employee = stream.employee as { id: string; displayName: string; userId: string | null };
    const isRecipient = employee.userId === session.userId;

    return NextResponse.json({
      success: true,
      stream: {
        id: stream.id,
        streamflowStreamId: stream.streamflowStreamId,
        onchainTx: stream.onchainTx,
        status: stream.status,
        employee: { id: stream.employee.id, displayName: stream.employee.displayName },
        contract: stream.contract,
        tokenMint: stream.tokenMint,
        tokenSymbol: stream.tokenSymbol,
        totalAmount: stream.totalAmount.toString(),
        startTime: stream.startTime,
        endTime: stream.endTime,
        cliffTime: stream.cliffTime,
        lastSyncedAt: stream.lastSyncedAt,
        isRecipient,
        streamflowDetails: streamflowDetails
          ? {
              availableAmount: streamflowDetails.availableAmount,
              withdrawnAmount: streamflowDetails.withdrawnAmount,
              status: streamflowDetails.status,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Get stream error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get stream',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(getStreamHandler, {
  requiredPermissions: ['VIEW_FINANCE_DASHBOARD'], // Anyone with finance view can see streams
});
