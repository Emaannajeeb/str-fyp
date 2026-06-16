/**
 * Approval Request API
 * POST: Request approval for contract or stream (HR/Manager permission)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';
import { z } from 'zod';

const requestApprovalSchema = z.object({
  subjectType: z.enum(['CONTRACT', 'STREAM']),
  subjectId: z.string().min(1, 'Subject ID is required'),
  step: z.number().int().positive().optional().default(1),
});

async function requestApprovalHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const body = await request.json();
    const { subjectType, subjectId, step } = requestApprovalSchema.parse(body);
    const metadata = getRequestMetadata(request);

    // Verify subject exists and belongs to organization
    if (subjectType === 'CONTRACT') {
      const contract = await db.contract.findFirst({
        where: {
          id: subjectId,
          organizationId: session.organizationId,
        },
      });

      if (!contract) {
        return NextResponse.json({ error: 'Contract not found or access denied' }, { status: 404 });
      }
    } else if (subjectType === 'STREAM') {
      // A STREAM approval represents funding approval. Before a stream exists it is
      // keyed by the contract id (funding sign-off), and afterwards by the stream id.
      const [stream, contract] = await Promise.all([
        db.stream.findFirst({
          where: {
            id: subjectId,
            organizationId: session.organizationId,
          },
          select: { id: true },
        }),
        db.contract.findFirst({
          where: {
            id: subjectId,
            organizationId: session.organizationId,
          },
          select: { id: true },
        }),
      ]);

      if (!stream && !contract) {
        return NextResponse.json(
          { error: 'Stream or contract not found or access denied' },
          { status: 404 }
        );
      }
    }

    // Check if approval already exists
    const existingApproval = await db.approval.findFirst({
      where: {
        organizationId: session.organizationId,
        subjectType,
        subjectId,
        step,
        status: 'PENDING',
      },
    });

    if (existingApproval) {
      return NextResponse.json(
        { error: 'Approval request already exists for this subject and step' },
        { status: 400 }
      );
    }

    // Create approval request
    const approval = await db.approval.create({
      data: {
        organizationId: session.organizationId,
        subjectType,
        subjectId,
        step,
        status: 'PENDING',
      },
    });

    // Log audit
    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: 'APPROVAL_REQUESTED',
      entity: 'APPROVAL',
      entityId: approval.id,
      after: {
        subjectType,
        subjectId,
        step,
        status: 'PENDING',
      },
      ...metadata,
    });

    return NextResponse.json({
      success: true,
      approval: {
        id: approval.id,
        subjectType: approval.subjectType,
        subjectId: approval.subjectId,
        step: approval.step,
        status: approval.status,
        createdAt: approval.createdAt,
      },
    });
  } catch (error) {
    console.error('Request approval error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: 'Failed to request approval',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const POST = withAuthAndRBAC(requestApprovalHandler, {
  requiredPermissions: ['APPROVE_PAYROLL'], // HR/Manager can request approvals
});
