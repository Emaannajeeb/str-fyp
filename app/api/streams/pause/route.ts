/**
 * Pause Stream API
 * POST: Pause an active stream (FINANCE_ADMIN permission required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';
import { createStreamflowClient } from '@/server/streamflow';
import { env } from '@/lib/env';
import { z } from 'zod';

const pauseStreamSchema = z.object({
  streamId: z.string().min(1, 'Stream ID is required'),
});

async function pauseStreamHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const body = await request.json();
    const { streamId } = pauseStreamSchema.parse(body);
    const metadata = getRequestMetadata(request);

    // Get stream
    const stream = await db.stream.findFirst({
      where: {
        id: streamId,
        organizationId: session.organizationId,
      },
    });

    if (!stream) {
      return NextResponse.json({ error: 'Stream not found or access denied' }, { status: 404 });
    }

    if (stream.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: `Cannot pause stream with status ${stream.status}` },
        { status: 400 }
      );
    }

    if (!stream.streamflowStreamId) {
      return NextResponse.json(
        { error: 'Stream does not have a Streamflow stream ID' },
        { status: 400 }
      );
    }

    // Pause via Streamflow client
    // Note: Streamflow SDK doesn't support pause, so we'll cancel instead
    // or just update the local status
    const streamflowClient = createStreamflowClient({
      clusterUrl: env.SOLANA_CLUSTER_URL,
      cluster: env.SOLANA_CLUSTER,
    });

    try {
      // SDK doesn't support pause, so we'll just update local status
      // In a real implementation, you might want to cancel the stream instead
      await streamflowClient.pauseStream(stream.streamflowStreamId);
    } catch (error) {
      // Log error to audit
      await createAuditLog({
        organizationId: session.organizationId,
        actorId: session.userId,
        action: 'STREAM_PAUSE_FAILED',
        entity: 'STREAM',
        entityId: streamId,
        before: { status: stream.status, streamflowStreamId: stream.streamflowStreamId },
        after: {
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
        ...metadata,
      });

      throw error;
    }

    // Update stream status
    const updatedStream = await db.stream.update({
      where: { id: streamId },
      data: {
        status: 'PAUSED',
        lastSyncedAt: new Date(),
      },
    });

    // Log audit
    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: 'STREAM_PAUSED',
      entity: 'STREAM',
      entityId: streamId,
      before: {
        status: stream.status,
      },
      after: {
        status: updatedStream.status,
      },
      ...metadata,
    });

    return NextResponse.json({
      success: true,
      stream: {
        id: updatedStream.id,
        status: updatedStream.status,
      },
    });
  } catch (error) {
    console.error('Pause stream error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: 'Failed to pause stream',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const POST = withAuthAndRBAC(pauseStreamHandler, {
  requiredPermissions: ['PAUSE_STREAM'],
});
