/**
 * Budget Detail API
 * GET: Get budget details
 * DELETE: Delete budget
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';
import { computeCommitted } from '@/server/finance/budget';

async function getBudgetHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string },
  context?: { params?: { id?: string } }
) {
  try {
    const budgetId = context?.params?.id;

    if (!budgetId) {
      return NextResponse.json({ error: 'Budget ID is required' }, { status: 400 });
    }

    const budget = await db.budget.findFirst({
      where: {
        id: budgetId,
        organizationId: session.organizationId,
      },
      include: {
        departmentBudgets: {
          include: {
            department: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!budget) {
      return NextResponse.json({ error: 'Budget not found' }, { status: 404 });
    }

    // Compute actual committed amount
    const actualCommitted = await computeCommitted(session.organizationId, budget.tokenMint);

    return NextResponse.json({
      success: true,
      budget: {
        id: budget.id,
        name: budget.name,
        tokenMint: budget.tokenMint,
        tokenSymbol: budget.tokenSymbol,
        capAmount: budget.capAmount.toString(),
        currentCommitted: actualCommitted,
        departments: budget.departmentBudgets.map((db) => db.department),
        createdAt: budget.createdAt,
      },
    });
  } catch (error) {
    console.error('Get budget error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get budget',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

async function deleteBudgetHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string },
  context?: { params?: { id?: string } }
) {
  try {
    const budgetId = context?.params?.id;
    const metadata = getRequestMetadata(request);

    if (!budgetId) {
      return NextResponse.json({ error: 'Budget ID is required' }, { status: 400 });
    }

    const budget = await db.budget.findFirst({
      where: {
        id: budgetId,
        organizationId: session.organizationId,
      },
    });

    if (!budget) {
      return NextResponse.json({ error: 'Budget not found' }, { status: 404 });
    }

    // Delete budget (cascade will delete department budgets)
    await db.budget.delete({
      where: { id: budgetId },
    });

    // Log audit
    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: 'DELETE',
      entity: 'BUDGET',
      entityId: budgetId,
      before: {
        name: budget.name,
        tokenMint: budget.tokenMint,
        capAmount: budget.capAmount.toString(),
      },
      ...metadata,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete budget error:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete budget',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(getBudgetHandler, {
  requiredPermissions: ['VIEW_FINANCE_DASHBOARD'],
});

export const DELETE = withAuthAndRBAC(deleteBudgetHandler, {
  requiredPermissions: ['MANAGE_BUDGET'],
});

