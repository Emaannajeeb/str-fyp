/**
 * Users API
 * GET: List all users (SYS_ADMIN only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';

async function listUsersHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    // Get users from the current organization only
    const users = await db.user.findMany({
      where: {
        userRoles: {
          some: {
            organizationId: session.organizationId,
          },
        },
      },
      include: {
        userRoles: {
          where: {
            organizationId: session.organizationId,
          },
          include: {
            role: {
              select: {
                id: true,
                key: true,
                label: true,
              },
            },
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const usersWithRoles = users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      roles: user.userRoles.map((ur) => ({
        id: ur.role.id,
        role: ur.role.key,
        roleLabel: ur.role.label,
        organization: ur.organization.name,
        organizationSlug: ur.organization.slug,
      })),
    }));

    return NextResponse.json({
      success: true,
      users: usersWithRoles,
      count: usersWithRoles.length,
    });
  } catch (error) {
    console.error('List users error:', error);
    return NextResponse.json(
      {
        error: 'Failed to list users',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Allow any authenticated user to view users list (or restrict to SYS_ADMIN if needed)
export const GET = withAuthAndRBAC(listUsersHandler, {
  requiredPermissions: [], // Allow all authenticated users to see the list
});

