/**
 * Employee's Own Streams API
 * GET: Get streams for the logged-in employee
 * Permission: VIEW_SELF_STREAMS (employees can only see their own streams)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { createStreamflowClient } from '@/server/streamflow';
import { env } from '@/lib/env';

async function getMyStreamsHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    // Find employee record for this user
    const employee = await db.employee.findFirst({
      where: {
        userId: session.userId,
        organizationId: session.organizationId,
      },
      select: {
        id: true,
        displayName: true,
      },
    });

    if (!employee) {
      return NextResponse.json(
        { error: 'Employee record not found for this user' },
        { status: 404 }
      );
    }

    // Get all streams for this employee
    const streams = await db.stream.findMany({
      where: {
        employeeId: employee.id,
        organizationId: session.organizationId,
      },
      include: {
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
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Fetch Streamflow details for each stream via polling
    const streamflowClient = createStreamflowClient({
      clusterUrl: env.SOLANA_CLUSTER_URL,
      cluster: env.SOLANA_CLUSTER,
    });

    const streamsWithDetails = await Promise.all(
      streams.map(async (stream) => {
        let streamflowDetails = null;
        if (stream.streamflowStreamId) {
          try {
            streamflowDetails = await streamflowClient.getOne(stream.streamflowStreamId);
          } catch (error) {
            console.warn(`Failed to fetch Streamflow details for stream ${stream.id}:`, error);
            // Continue without Streamflow details
          }
        }

        // Calculate accrued amount
        const now = new Date();
        const startTime = new Date(stream.startTime);
        const endTime = new Date(stream.endTime);
        const totalAmount = Number(stream.totalAmount);
        
        let accruedAmount = 0;
        let nextCliff: Date | null = null;

        if (streamflowDetails) {
          // Use Streamflow's available amount (already accrued)
          accruedAmount = Number(streamflowDetails.availableAmount || 0);
        } else {
          // Calculate based on time elapsed (for demo/mock)
          // Check if cliff period has passed
          const cliffPassed = !stream.cliffTime || now >= stream.cliffTime;
          
          if (cliffPassed) {
            if (now >= startTime && now <= endTime) {
              const totalDuration = endTime.getTime() - startTime.getTime();
              const elapsed = now.getTime() - startTime.getTime();
              accruedAmount = (totalAmount * elapsed) / totalDuration;
            } else if (now > endTime) {
              accruedAmount = totalAmount;
            }
          } else {
            // Still in cliff period, no accrual yet
            accruedAmount = 0;
          }
        }

        // Calculate next cliff if applicable
        if (stream.cliffTime) {
          const cliffDate = new Date(stream.cliffTime);
          if (now < cliffDate) {
            nextCliff = cliffDate;
          }
        }

        return {
          id: stream.id,
          streamflowStreamId: stream.streamflowStreamId,
          onchainTx: stream.onchainTx,
          status: stream.status,
          tokenSymbol: stream.tokenSymbol,
          tokenMint: stream.tokenMint,
          totalAmount: stream.totalAmount.toString(),
          accruedAmount: accruedAmount.toFixed(8),
          withdrawnAmount: streamflowDetails?.withdrawnAmount || '0',
          startTime: stream.startTime,
          endTime: stream.endTime,
          cliffTime: stream.cliffTime,
          nextCliff,
          contract: stream.contract,
          lastSyncedAt: stream.lastSyncedAt,
        };
      })
    );

    return NextResponse.json({
      success: true,
      employee: {
        id: employee.id,
        displayName: employee.displayName,
      },
      streams: streamsWithDetails,
    });
  } catch (error) {
    console.error('Get my streams error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch streams',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(getMyStreamsHandler, {
  requiredPermissions: ['VIEW_SELF_STREAMS'],
});

