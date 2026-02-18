/**
 * Budgets API
 * GET: List budgets
 * POST: Create budget (FINANCE_ADMIN permission required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';
import { z } from 'zod';
import { Decimal } from '@prisma/client/runtime/library';

const createBudgetSchema = z.object({
  name: z.string().min(1, 'Budget name is required'),
  tokenMint: z.string().min(1, 'Token mint is required'),
  tokenSymbol: z.string().min(1, 'Token symbol is required'),
  capAmount: z.string().or(z.number()),
});

async function listBudgetsHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const budgets = await db.budget.findMany({
      where: {
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
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      budgets: budgets.map((budget) => ({
        id: budget.id,
        name: budget.name,
        tokenMint: budget.tokenMint,
        tokenSymbol: budget.tokenSymbol,
        capAmount: budget.capAmount.toString(),
        currentCommitted: budget.currentCommitted.toString(),
        departments: budget.departmentBudgets.map((db) => db.department),
        createdAt: budget.createdAt,
      })),
    });
  } catch (error) {
    console.error('List budgets error:', error);
    return NextResponse.json(
      {
        error: 'Failed to list budgets',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

async function createBudgetHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const body = await request.json();
    const data = createBudgetSchema.parse(body);
    const metadata = getRequestMetadata(request);

    // Convert amount to Decimal
    const capAmount = new Decimal(
      typeof data.capAmount === 'string' ? data.capAmount : data.capAmount.toString()
    );

    // Create budget
    const budget = await db.budget.create({
      data: {
        organizationId: session.organizationId,
        name: data.name,
        tokenMint: data.tokenMint,
        tokenSymbol: data.tokenSymbol,
        capAmount,
        currentCommitted: new Decimal(0),
      },
    });

    // Log audit
    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: 'CREATE',
      entity: 'BUDGET',
      entityId: budget.id,
      after: {
        name: budget.name,
        tokenMint: budget.tokenMint,
        tokenSymbol: budget.tokenSymbol,
        capAmount: budget.capAmount.toString(),
      },
      ...metadata,
    });

    return NextResponse.json({
      success: true,
      budget: {
        id: budget.id,
        name: budget.name,
        tokenMint: budget.tokenMint,
        tokenSymbol: budget.tokenSymbol,
        capAmount: budget.capAmount.toString(),
        currentCommitted: budget.currentCommitted.toString(),
      },
    });
  } catch (error) {
    console.error('Create budget error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: 'Failed to create budget',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(listBudgetsHandler, {
  requiredPermissions: ['VIEW_BUDGET', 'VIEW_FINANCE_DASHBOARD'], // Allow either permission
});

export const POST = withAuthAndRBAC(createBudgetHandler, {
  requiredPermissions: ['MANAGE_BUDGET'],
});

