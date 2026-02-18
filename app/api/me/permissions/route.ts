/**
 * Get current user's permissions
 * GET: Returns all permissions for the logged-in user
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { getUserPermissions } from '@/lib/rbac';

async function getPermissionsHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const permissions = await getUserPermissions(session.userId, session.organizationId);

    return NextResponse.json({
      success: true,
      permissions,
    });
  } catch (error) {
    console.error('Get permissions error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get permissions',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(getPermissionsHandler, {
  requiredPermissions: [], // No specific permission required, just authenticated
});

