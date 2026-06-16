/**
 * Employee's own stream transaction history (audit logs scoped to their streams)
 * GET: Withdrawal and stream lifecycle events for the logged-in employee
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';

const STREAM_ACTIONS = ['STREAM_WITHDRAW', 'STREAM_CREATED', 'STREAM_PAUSED', 'STREAM_CANCELLED'];

function parseAuditAfter(payload: unknown): { amount?: string; txSignature?: string | null } {
  if (payload === null || typeof payload !== 'object') {
    return {};
  }
  const record = payload as Record<string, unknown>;
  const amount = typeof record.amount === 'string' ? record.amount : undefined;
  const txSignature =
    typeof record.txSignature === 'string'
      ? record.txSignature
      : record.txSignature === null
        ? null
        : undefined;
  return { amount, txSignature };
}

async function getMyTransactionsHandler(
  _request: NextRequest,
  session: { userId: string; organizationId: string }
): Promise<NextResponse> {
  try {
    const employee = await db.employee.findFirst({
      where: {
        userId: session.userId,
        organizationId: session.organizationId,
      },
      select: { id: true },
    });

    if (!employee) {
      return NextResponse.json({
        success: true,
        transactions: [],
      });
    }

    const streams = await db.stream.findMany({
      where: {
        employeeId: employee.id,
        organizationId: session.organizationId,
      },
      select: { id: true },
    });

    const streamIds = streams.map((s) => s.id);

    if (streamIds.length === 0) {
      return NextResponse.json({
        success: true,
        transactions: [],
      });
    }

    const logs = await db.auditLog.findMany({
      where: {
        organizationId: session.organizationId,
        entity: 'STREAM',
        entityId: { in: streamIds },
        action: { in: STREAM_ACTIONS },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        action: true,
        entityId: true,
        after: true,
        createdAt: true,
      },
    });

    const transactions = logs.map((log) => {
      const { amount, txSignature } = parseAuditAfter(log.after);
      return {
        action: log.action,
        streamId: log.entityId,
        amount: amount ?? null,
        txSignature: txSignature ?? null,
        createdAt: log.createdAt,
      };
    });

    return NextResponse.json({
      success: true,
      transactions,
    });
  } catch (error) {
    console.error('Get my transactions error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch transactions',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(getMyTransactionsHandler, {
  requiredPermissions: [],
});
