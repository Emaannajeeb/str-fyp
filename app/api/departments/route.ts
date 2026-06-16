/**
 * Departments API
 * GET: List departments for the organization
 * POST: Create a department (MANAGE_BUDGET permission required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';
import { z } from 'zod';

async function listDepartmentsHandler(
  _request: NextRequest,
  session: { userId: string; organizationId: string }
): Promise<NextResponse> {
  try {
    const departments = await db.department.findMany({
      where: {
        organizationId: session.organizationId,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return NextResponse.json({
      success: true,
      departments,
    });
  } catch (error) {
    console.error('List departments error:', error);
    return NextResponse.json(
      {
        error: 'Failed to list departments',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

const createDepartmentSchema = z.object({
  name: z.string().min(1, 'Department name is required'),
});

async function createDepartmentHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { name } = createDepartmentSchema.parse(body);
    const metadata = getRequestMetadata(request);

    const existing = await db.department.findFirst({
      where: {
        organizationId: session.organizationId,
        name,
      },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'A department with this name already exists' },
        { status: 400 }
      );
    }

    const department = await db.department.create({
      data: {
        organizationId: session.organizationId,
        name,
      },
      select: {
        id: true,
        name: true,
      },
    });

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: 'CREATE',
      entity: 'DEPARTMENT',
      entityId: department.id,
      after: { name: department.name },
      ...metadata,
    });

    return NextResponse.json({ success: true, department });
  } catch (error) {
    console.error('Create department error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: 'Failed to create department',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(listDepartmentsHandler, {
  requiredPermissions: [
    'VIEW_BUDGET',
    'VIEW_FINANCE_DASHBOARD',
    'MANAGE_BUDGET',
    'MANAGE_EMPLOYEES',
  ],
});

export const POST = withAuthAndRBAC(createDepartmentHandler, {
  requiredPermissions: ['MANAGE_BUDGET'],
});
