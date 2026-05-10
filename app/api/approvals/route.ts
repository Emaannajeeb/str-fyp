/**
 * List approvals for the organization
 * GET: Query params - status (PENDING|APPROVED|REJECTED), subjectType (CONTRACT|STREAM), limit, offset
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { ApprovalStatus } from '@prisma/client';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';

function parseApprovalStatus(value: string | null): ApprovalStatus | undefined {
  if (!value) return undefined;
  switch (value) {
    case ApprovalStatus.PENDING:
    case ApprovalStatus.APPROVED:
    case ApprovalStatus.REJECTED:
    case ApprovalStatus.CANCELLED:
      return value;
    default:
      return undefined;
  }
}

async function listApprovalsHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as string | null;
    const subjectType = searchParams.get('subjectType') as string | null;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const where: Prisma.ApprovalWhereInput = {
      organizationId: session.organizationId,
    };
    const parsedStatus = parseApprovalStatus(status);
    if (parsedStatus) where.status = parsedStatus;
    if (subjectType) where.subjectType = subjectType;

    const [approvals, total] = await Promise.all([
      db.approval.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
        skip: offset,
        include: {
          approver: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      }),
      db.approval.count({ where }),
    ]);

    const contractIds = approvals
      .filter((a) => a.subjectType === 'CONTRACT')
      .map((a) => a.subjectId);
    const contracts =
      contractIds.length > 0
        ? await db.contract.findMany({
            where: { id: { in: contractIds }, organizationId: session.organizationId },
            include: {
              employee: { select: { id: true, displayName: true } },
            },
          })
        : [];
    const contractMap = new Map(contracts.map((c) => [c.id, c]));

    const list = approvals.map((a) => {
      const contract = a.subjectType === 'CONTRACT' ? contractMap.get(a.subjectId) : null;
      return {
        id: a.id,
        subjectType: a.subjectType,
        subjectId: a.subjectId,
        step: a.step,
        status: a.status,
        approverId: a.approverId,
        approvedAt: a.approvedAt,
        createdAt: a.createdAt,
        approver: a.approver,
        subjectSummary:
          contract?.employee?.displayName != null
            ? `${contract.employee.displayName} – ${contract.tokenSymbol} ${contract.amountPerPeriod}/${contract.period}`
            : null,
      };
    });

    return NextResponse.json({
      success: true,
      approvals: list,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('List approvals error:', error);
    return NextResponse.json(
      {
        error: 'Failed to list approvals',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(listApprovalsHandler, {
  requiredPermissions: [],
});
