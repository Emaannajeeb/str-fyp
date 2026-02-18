/**
 * Approval Approve API
 * POST: Approve an approval request (MANAGER permission required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';
import { z } from 'zod';

const approveSchema = z.object({
  approvalId: z.string().min(1, 'Approval ID is required'),
});

async function approveHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const body = await request.json();
    const { approvalId } = approveSchema.parse(body);
    const metadata = getRequestMetadata(request);

    // Get approval
    const approval = await db.approval.findFirst({
      where: {
        id: approvalId,
        organizationId: session.organizationId,
      },
    });

    if (!approval) {
      return NextResponse.json(
        { error: 'Approval not found or access denied' },
        { status: 404 }
      );
    }

    if (approval.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Cannot approve approval with status ${approval.status}` },
        { status: 400 }
      );
    }

    // Update approval
    const updatedApproval = await db.approval.update({
      where: { id: approvalId },
      data: {
        status: 'APPROVED',
        approverId: session.userId,
        approvedAt: new Date(),
      },
    });

    // Log audit
    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: 'APPROVE',
      entity: 'APPROVAL',
      entityId: approvalId,
      before: {
        status: approval.status,
        approverId: approval.approverId,
        approvedAt: approval.approvedAt,
      },
      after: {
        status: updatedApproval.status,
        approverId: updatedApproval.approverId,
        approvedAt: updatedApproval.approvedAt?.toISOString(),
      },
      ...metadata,
    });

    return NextResponse.json({
      success: true,
      approval: {
        id: updatedApproval.id,
        subjectType: updatedApproval.subjectType,
        subjectId: updatedApproval.subjectId,
        step: updatedApproval.step,
        status: updatedApproval.status,
        approverId: updatedApproval.approverId,
        approvedAt: updatedApproval.approvedAt,
      },
    });
  } catch (error) {
    console.error('Approve error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: 'Failed to approve',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const POST = withAuthAndRBAC(approveHandler, {
  requiredPermissions: ['APPROVE_PAYROLL'], // Manager can approve
});

