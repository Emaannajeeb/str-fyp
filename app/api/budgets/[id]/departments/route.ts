/**
 * Assign Budget to Department API
 * POST: Assign budget to department
 * DELETE: Remove budget from department
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';
import { z } from 'zod';

const assignBudgetSchema = z.object({
  departmentId: z.string().min(1, 'Department ID is required'),
});

async function assignBudgetHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string },
  context?: { params?: { id?: string } }
) {
  try {
    const budgetId = context?.params?.id;
    const body = await request.json();
    const { departmentId } = assignBudgetSchema.parse(body);
    const metadata = getRequestMetadata(request);

    if (!budgetId) {
      return NextResponse.json({ error: 'Budget ID is required' }, { status: 400 });
    }

    // Verify budget belongs to organization
    const budget = await db.budget.findFirst({
      where: {
        id: budgetId,
        organizationId: session.organizationId,
      },
    });

    if (!budget) {
      return NextResponse.json({ error: 'Budget not found' }, { status: 404 });
    }

    // Verify department belongs to organization
    const department = await db.department.findFirst({
      where: {
        id: departmentId,
        organizationId: session.organizationId,
      },
    });

    if (!department) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }

    // Check if already assigned
    const existing = await db.departmentBudget.findFirst({
      where: {
        budgetId,
        departmentId,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Budget already assigned to this department' },
        { status: 400 }
      );
    }

    // Assign budget to department
    await db.departmentBudget.create({
      data: {
        budgetId,
        departmentId,
      },
    });

    // Log audit
    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: 'BUDGET_ASSIGNED',
      entity: 'DEPARTMENT_BUDGET',
      entityId: `${budgetId}-${departmentId}`,
      after: {
        budgetId,
        departmentId,
        departmentName: department.name,
      },
      ...metadata,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Assign budget error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: 'Failed to assign budget',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

async function unassignBudgetHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string },
  context?: { params?: { id?: string } }
) {
  try {
    const budgetId = context?.params?.id;
    const body = await request.json();
    const { departmentId } = assignBudgetSchema.parse(body);
    const metadata = getRequestMetadata(request);

    if (!budgetId) {
      return NextResponse.json({ error: 'Budget ID is required' }, { status: 400 });
    }

    // Delete assignment
    await db.departmentBudget.deleteMany({
      where: {
        budgetId,
        departmentId,
      },
    });

    // Log audit
    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: 'BUDGET_UNASSIGNED',
      entity: 'DEPARTMENT_BUDGET',
      entityId: `${budgetId}-${departmentId}`,
      before: {
        budgetId,
        departmentId,
      },
      ...metadata,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unassign budget error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: 'Failed to unassign budget',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const POST = withAuthAndRBAC(assignBudgetHandler, {
  requiredPermissions: ['MANAGE_BUDGET'],
});

export const DELETE = withAuthAndRBAC(unassignBudgetHandler, {
  requiredPermissions: ['MANAGE_BUDGET'],
});

