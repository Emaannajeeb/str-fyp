/**
 * Employees API
 * GET: List employees
 * POST: Create employee (HR permission required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';
import { env } from '@/lib/env';
import { z } from 'zod';

async function listEmployeesHandler(
  _request: NextRequest,
  session: { userId: string; organizationId: string }
): Promise<NextResponse> {
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
        user: {
          select: {
            email: true,
            wallets: {
              where: {
                organizationId: session.organizationId,
                isPrimary: true,
              },
              select: {
                address: true,
              },
              take: 1,
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
      employees: employees.map((employee) => ({
        id: employee.id,
        displayName: employee.displayName,
        status: employee.status,
        startDate: employee.startDate,
        endDate: employee.endDate,
        userId: employee.userId,
        email: employee.user?.email ?? null,
        walletAddress: employee.user?.wallets[0]?.address ?? null,
      })),
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
  email: z.string().email('Valid email is required'),
  walletAddress: z.string().min(1).optional(),
  startDate: z.string().datetime().or(z.date()),
  endDate: z.string().datetime().optional().or(z.date().optional()),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE']).optional(),
});

async function createEmployeeHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const data = createEmployeeSchema.parse(body);
    const metadata = getRequestMetadata(request);

    const startDate =
      typeof data.startDate === 'string' ? new Date(data.startDate) : data.startDate;
    const endDate = data.endDate
      ? typeof data.endDate === 'string'
        ? new Date(data.endDate)
        : data.endDate
      : undefined;

    let user = await db.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      user = await db.user.create({
        data: {
          email: data.email,
          name: data.displayName,
        },
      });
    }

    const employeeRole = await db.role.findUnique({
      where: { key: 'EMPLOYEE' },
    });

    if (!employeeRole) {
      return NextResponse.json(
        { error: 'EMPLOYEE role not configured. Run database seed.' },
        { status: 500 }
      );
    }

    const existingUserRole = await db.userRole.findFirst({
      where: {
        userId: user.id,
        organizationId: session.organizationId,
        roleId: employeeRole.id,
      },
    });

    if (!existingUserRole) {
      await db.userRole.create({
        data: {
          userId: user.id,
          organizationId: session.organizationId,
          roleId: employeeRole.id,
        },
      });
    }

    if (data.walletAddress) {
      const existingWallet = await db.wallet.findFirst({
        where: {
          userId: user.id,
          organizationId: session.organizationId,
          address: data.walletAddress,
        },
      });

      if (!existingWallet) {
        const hasPrimaryWallet = await db.wallet.findFirst({
          where: {
            userId: user.id,
            organizationId: session.organizationId,
            isPrimary: true,
          },
        });

        await db.wallet.create({
          data: {
            userId: user.id,
            organizationId: session.organizationId,
            address: data.walletAddress,
            provider: 'manual',
            network: env.SOLANA_CLUSTER,
            isPrimary: !hasPrimaryWallet,
          },
        });
      }
    }

    const employee = await db.employee.create({
      data: {
        organizationId: session.organizationId,
        userId: user.id,
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
            wallets: {
              where: {
                organizationId: session.organizationId,
                isPrimary: true,
              },
              select: {
                address: true,
              },
              take: 1,
            },
          },
        },
      },
    });

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
        email: user.email,
        userId: user.id,
        walletAddress: employee.user?.wallets[0]?.address ?? null,
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
        email: employee.user?.email ?? null,
        walletAddress: employee.user?.wallets[0]?.address ?? null,
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
  requiredPermissions: ['VIEW_FINANCE_DASHBOARD', 'MANAGE_EMPLOYEES'],
});

export const POST = withAuthAndRBAC(createEmployeeHandler, {
  requiredPermissions: ['MANAGE_EMPLOYEES'],
});
