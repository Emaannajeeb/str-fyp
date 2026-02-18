/**
 * Protected Demo API Route
 *
 * Example of using the withAuthAndRBAC middleware guard.
 * This route requires VIEW_FINANCE_DASHBOARD permission.
 *
 * To test:
 * 1. Get a user ID and organization ID from your database
 * 2. Make a request with headers:
 *    - X-User-Id: <user-id>
 *    - X-Organization-Id: <organization-id>
 *
 * Example with curl:
 * curl -H "X-User-Id: <user-id>" \
 *      -H "X-Organization-Id: <organization-id>" \
 *      http://localhost:3000/api/protected-demo
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { PERMISSION_KEYS } from '@/types/rbac';
import type { Session } from '@/lib/auth';

/**
 * GET handler - requires VIEW_FINANCE_DASHBOARD permission
 */
export const GET = withAuthAndRBAC(
  async (request: NextRequest, session: Session) => {
    return NextResponse.json({
      message: 'Successfully accessed protected route',
      user: {
        id: session.userId,
        email: session.email,
        name: session.name,
      },
      organizationId: session.organizationId,
      requiredPermission: PERMISSION_KEYS.VIEW_FINANCE_DASHBOARD,
      timestamp: new Date().toISOString(),
    });
  },
  {
    requiredPermissions: PERMISSION_KEYS.VIEW_FINANCE_DASHBOARD,
  }
);

/**
 * POST handler - requires multiple permissions (OR logic)
 * User needs either APPROVE_PAYROLL OR CREATE_STREAM
 */
export const POST = withAuthAndRBAC(
  async (request: NextRequest, session: Session) => {
    const body = await request.json().catch(() => ({}));

    return NextResponse.json({
      message: 'Successfully accessed protected POST route',
      user: {
        id: session.userId,
        email: session.email,
        name: session.name,
      },
      organizationId: session.organizationId,
      requiredPermissions: [PERMISSION_KEYS.APPROVE_PAYROLL, PERMISSION_KEYS.CREATE_STREAM],
      receivedData: body,
      timestamp: new Date().toISOString(),
    });
  },
  {
    requiredPermissions: [PERMISSION_KEYS.APPROVE_PAYROLL, PERMISSION_KEYS.CREATE_STREAM],
    requireAll: false, // User needs at least one of these permissions
  }
);

