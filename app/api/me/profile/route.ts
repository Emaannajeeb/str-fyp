/**
 * Current user profile for employee dashboard
 * GET: Profile, employee record, roles, primary wallet
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';

async function getProfileHandler(
  _request: NextRequest,
  session: { userId: string; organizationId: string }
): Promise<NextResponse> {
  try {
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userRoles = await db.userRole.findMany({
      where: {
        userId: session.userId,
        organizationId: session.organizationId,
      },
      include: {
        role: {
          select: {
            key: true,
            label: true,
          },
        },
      },
    });

    const employee = await db.employee.findFirst({
      where: {
        userId: session.userId,
        organizationId: session.organizationId,
      },
      select: {
        id: true,
        displayName: true,
        status: true,
        startDate: true,
      },
    });

    const wallet = await db.wallet.findFirst({
      where: {
        userId: session.userId,
        organizationId: session.organizationId,
        isPrimary: true,
      },
      select: {
        address: true,
        provider: true,
        network: true,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        email: user.email,
        name: user.name,
      },
      employee: employee
        ? {
            id: employee.id,
            displayName: employee.displayName,
            status: employee.status,
            startDate: employee.startDate,
          }
        : null,
      roles: userRoles.map((ur) => ({
        key: ur.role.key,
        label: ur.role.label,
      })),
      wallet: wallet
        ? {
            address: wallet.address,
            provider: wallet.provider,
            network: wallet.network,
          }
        : null,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch profile',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(getProfileHandler, {
  requiredPermissions: [],
});
