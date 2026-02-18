/**
 * Employees API
 * GET: List employees
 * POST: Create employee (HR permission required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';
import { z } from 'zod';

async function listEmployeesHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const employees = await db.employee.findMany({
      where: {
        organizationId: session.organizationId,
      },
      select: {
        id: true,
        displayName: true,
        status: true,
        startDate: true,
        endDate: true,
        userId: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      employees,
    });
  } catch (error) {
    console.error('List employees error:', error);
    return NextResponse.json(
      {
        error: 'Failed to list employees',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

const createEmployeeSchema = z.object({
  displayName: z.string().min(1, 'Display name is required'),
  userId: z.string().optional(),
  startDate: z.string().datetime().or(z.date()),
  endDate: z.string().datetime().optional().or(z.date().optional()),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE']).optional(),
});

async function createEmployeeHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const body = await request.json();
    const data = createEmployeeSchema.parse(body);
    const metadata = getRequestMetadata(request);

    // Parse dates
    const startDate = typeof data.startDate === 'string' ? new Date(data.startDate) : data.startDate;
    const endDate = data.endDate
      ? typeof data.endDate === 'string'
        ? new Date(data.endDate)
        : data.endDate
      : undefined;

    // Create employee
    const employee = await db.employee.create({
      data: {
        organizationId: session.organizationId,
        userId: data.userId || null,
        displayName: data.displayName,
        status: data.status || 'ACTIVE',
        startDate,
        endDate: endDate || null,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    // Log audit
    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: 'CREATE',
      entity: 'EMPLOYEE',
      entityId: employee.id,
      after: {
        displayName: employee.displayName,
        status: employee.status,
        startDate: employee.startDate.toISOString(),
        endDate: employee.endDate?.toISOString() || null,
      },
      ...metadata,
    });

    return NextResponse.json({
      success: true,
      employee: {
        id: employee.id,
        displayName: employee.displayName,
        status: employee.status,
        startDate: employee.startDate,
        endDate: employee.endDate,
        userId: employee.userId,
        user: employee.user,
      },
    });
  } catch (error) {
    console.error('Create employee error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: 'Failed to create employee',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(listEmployeesHandler, {
  requiredPermissions: ['VIEW_FINANCE_DASHBOARD', 'MANAGE_EMPLOYEES'], // Allow either permission
});

export const POST = withAuthAndRBAC(createEmployeeHandler, {
  requiredPermissions: ['MANAGE_EMPLOYEES'],
});

