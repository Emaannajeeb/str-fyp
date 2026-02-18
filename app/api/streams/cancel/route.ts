/**
 * Cancel Stream API
 * POST: Cancel a stream (FINANCE_ADMIN permission required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';
import { createStreamflowClient } from '@/server/streamflow';
import { env } from '@/lib/env';
import { z } from 'zod';

const cancelStreamSchema = z.object({
  streamId: z.string().min(1, 'Stream ID is required'),
});

async function cancelStreamHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const body = await request.json();
    const { streamId } = cancelStreamSchema.parse(body);
    const metadata = getRequestMetadata(request);

    // Get stream
    const stream = await db.stream.findFirst({
      where: {
        id: streamId,
        organizationId: session.organizationId,
      },
    });

    if (!stream) {
      return NextResponse.json(
        { error: 'Stream not found or access denied' },
        { status: 404 }
      );
    }

    if (stream.status === 'COMPLETED') {
      return NextResponse.json(
        { error: 'Cannot cancel completed stream' },
        { status: 400 }
      );
    }

    if (!stream.streamflowStreamId) {
      return NextResponse.json(
        { error: 'Stream does not have a Streamflow stream ID' },
        { status: 400 }
      );
    }

    // Cancel via Streamflow client
    const streamflowClient = createStreamflowClient({
      clusterUrl: env.SOLANA_CLUSTER_URL,
      cluster: env.SOLANA_CLUSTER,
    });

    // Get server-side wallet adapter for signing transactions
    // NOTE: This requires STREAMFLOW_SENDER_PRIVATE_KEY to be set in env
    // For production with Phantom wallets, this should be refactored to use client-side signing
    // similar to stream creation
    const { getServerWalletAdapter } = await import('@/server/streamflow/wallet-adapter');
    const wallet = getServerWalletAdapter();
    
    // Create a ConnectedWallet wrapper for the server adapter
    const serverWallet = {
      address: wallet.publicKey.toString(),
      signMessage: async (msg: Uint8Array) => {
        const sig = wallet.sign(msg);
        return sig.signature;
      },
      signAndSendTransaction: async (tx: unknown) => {
        // Server-side: sign transaction (Streamflow SDK will send it)
        await wallet.signTransaction(tx as any);
        return 'server-tx-id';
      },
      disconnect: async () => {},
    };

    let txId: string;
    try {
      txId = await streamflowClient.cancelStream(stream.streamflowStreamId, serverWallet);
    } catch (error) {
      // Log error to audit
      await createAuditLog({
        organizationId: session.organizationId,
        actorId: session.userId,
        action: 'STREAM_CANCEL_FAILED',
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

    // Update stream status and transaction ID
    const updatedStream = await db.stream.update({
      where: { id: streamId },
      data: {
        status: 'CANCELLED',
        onchainTx: txId,
        lastSyncedAt: new Date(),
      },
    });

    // Log audit
    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: 'STREAM_CANCELLED',
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
    console.error('Cancel stream error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: 'Failed to cancel stream',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const POST = withAuthAndRBAC(cancelStreamHandler, {
  requiredPermissions: ['CANCEL_STREAM'],
});

