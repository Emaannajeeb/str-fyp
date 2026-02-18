/**
 * Streams API
 * GET: List all streams for the organization
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { buildExplorerTxUrl } from '@/server/streamflow/client';

async function listStreamsHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const streams = await db.stream.findMany({
      where: {
        organizationId: session.organizationId,
      },
      include: {
        employee: {
          select: {
            id: true,
            displayName: true,
          },
        },
        contract: {
          select: {
            id: true,
            tokenSymbol: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Add explorer URLs for streams with on-chain transactions
    const streamsWithExplorer = streams.map((stream) => ({
      id: stream.id,
      streamflowStreamId: stream.streamflowStreamId,
      onchainTx: stream.onchainTx,
      explorerUrl: stream.onchainTx ? buildExplorerTxUrl(stream.onchainTx) : null,
      status: stream.status,
      tokenSymbol: stream.tokenSymbol,
      totalAmount: stream.totalAmount.toString(),
      startTime: stream.startTime.toISOString(),
      endTime: stream.endTime.toISOString(),
      cliffTime: stream.cliffTime?.toISOString() || null,
      employee: stream.employee,
      contract: stream.contract,
    }));

    return NextResponse.json({
      success: true,
      streams: streamsWithExplorer,
    });
  } catch (error) {
    console.error('List streams error:', error);
    return NextResponse.json(
      {
        error: 'Failed to list streams',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(listStreamsHandler, {
  requiredPermissions: ['VIEW_SELF_STREAMS'], // Users can view streams in their org
});

