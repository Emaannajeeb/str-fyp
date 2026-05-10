/**
 * Record a stream withdrawal for audit (client performs the actual on-chain withdraw).
 * POST body: streamId, amount, txSignature (optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';
import { z } from 'zod';

const withdrawSchema = z.object({
  streamId: z.string().min(1),
  amount: z.string().min(1),
  txSignature: z.string().optional(),
});

async function withdrawHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const body = await request.json();
    const data = withdrawSchema.parse(body);
    const metadata = getRequestMetadata(request);

    const stream = await db.stream.findFirst({
      where: {
        id: data.streamId,
        organizationId: session.organizationId,
      },
      include: {
        employee: {
          include: {
            user: {
              include: {
                wallets: {
                  where: { organizationId: session.organizationId, isPrimary: true },
                },
              },
            },
          },
        },
      },
    });

    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }

    if (!stream.employee?.userId) {
      return NextResponse.json({ error: 'Stream employee has no linked user' }, { status: 400 });
    }

    if (stream.employee.userId !== session.userId) {
      return NextResponse.json(
        { error: 'Only the stream recipient can record this withdrawal' },
        { status: 403 }
      );
    }

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: 'STREAM_WITHDRAW',
      entity: 'STREAM',
      entityId: stream.id,
      before: {
        streamflowStreamId: stream.streamflowStreamId,
        withdrawnAt: new Date().toISOString(),
      },
      after: {
        amount: data.amount,
        txSignature: data.txSignature ?? null,
      },
      ...metadata,
    });

    return NextResponse.json({
      success: true,
      message: 'Withdrawal recorded',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Withdraw record error:', error);
    return NextResponse.json(
      {
        error: 'Failed to record withdrawal',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const POST = withAuthAndRBAC(withdrawHandler, {
  requiredPermissions: [], // Recipient only; validated inside handler
});
