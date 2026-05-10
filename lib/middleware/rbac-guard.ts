/**
 * RBAC Middleware Guard for API Routes
 *
 * Provides a higher-order function to protect API routes with authentication
 * and role-based access control.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, Session } from '@/lib/auth';
import { assertPermission, PermissionDeniedError } from '@/lib/rbac';
import { PermissionKey } from '@/types/rbac';

/** Resolved dynamic route params (after awaiting `context.params`) */
export type RouteParams = Record<string, string | string[] | undefined>;

/**
 * Next.js 15 App Router passes `params` as a Promise on the route context.
 */
export type AppRouteHandlerContext = {
  params: Promise<RouteParams>;
};

/**
 * Exported route handler shape expected by Next.js for API routes
 */
export type ApiHandler = (
  request: NextRequest,
  context: AppRouteHandlerContext
) => Promise<NextResponse>;

/**
 * Options for the RBAC guard
 */
export interface RBACGuardOptions {
  /**
   * Required permissions (user must have at least one if array, or all if using AND logic)
   */
  requiredPermissions: PermissionKey | PermissionKey[];
  /**
   * If true, user must have ALL permissions (AND logic)
   * If false, user must have at least ONE permission (OR logic)
   * @default false
   */
  requireAll?: boolean;
  /**
   * Custom error message for permission denial
   */
  errorMessage?: string;
}

/**
 * Extract request metadata for audit logging
 */
function getRequestMetadata(request: NextRequest): {
  ip: string | undefined;
  userAgent: string | undefined;
} {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  return { ip, userAgent };
}

/**
 * Higher-order function to protect API routes with authentication and RBAC
 *
 * @param handler - The API route handler function
 * @param options - RBAC guard options
 * @returns Protected handler function
 *
 * @example
 * ```ts
 * export const GET = withAuthAndRBAC(
 *   async (request) => {
 *     return NextResponse.json({ message: 'Protected route' });
 *   },
 *   {
 *     requiredPermissions: ['VIEW_FINANCE_DASHBOARD'],
 *   }
 * );
 * ```
 */
export function withAuthAndRBAC(
  handler: (
    request: NextRequest,
    session: Session,
    context?: { params?: RouteParams }
  ) => Promise<NextResponse>,
  options: RBACGuardOptions
): ApiHandler {
  return async (request: NextRequest, routeContext: AppRouteHandlerContext) => {
    try {
      // 1. Require authentication
      const session = await requireAuth(request);

      // 1.5. Validate organization exists
      const { db } = await import('@/server/db');
      const organization = await db.organization.findUnique({
        where: { id: session.organizationId },
        select: { id: true },
      });

      if (!organization) {
        return NextResponse.json(
          {
            error: 'Invalid session',
            message: 'Organization not found. Please sign in again.',
          },
          { status: 401 }
        );
      }

      // 2. Check permissions (skip if no permissions required)
      const { requiredPermissions, requireAll = false, errorMessage: _errorMessage } =
        options;
      const permissionKeys = Array.isArray(requiredPermissions)
        ? requiredPermissions
        : [requiredPermissions];

      // If no permissions required, skip permission checks
      if (permissionKeys.length === 0) {
        // No permission check needed, proceed to handler
      } else {
        const requestMetadata = getRequestMetadata(request);
        const contextString = `${request.method} ${request.nextUrl.pathname}`;

        if (requireAll) {
          // User must have ALL permissions
          for (const permissionKey of permissionKeys) {
            await assertPermission(
              session.userId,
              session.organizationId,
              permissionKey,
              contextString,
              requestMetadata
            );
          }
        } else {
          // User must have at least ONE permission
          const { hasAnyPermission } = await import('@/lib/rbac');
          const hasAccess = await hasAnyPermission(
            session.userId,
            session.organizationId,
            permissionKeys
          );

          if (!hasAccess) {
            // Log the first permission as the denied one
            await assertPermission(
              session.userId,
              session.organizationId,
              permissionKeys[0],
              contextString,
              requestMetadata
            );
          }
        }
      }

      // 3. Call the handler with session (resolve params for handlers that read dynamic segments)
      const params = await routeContext.params;
      return await handler(request, session, { params });
    } catch (error) {
      // Handle permission denied errors
      if (error instanceof PermissionDeniedError) {
        return NextResponse.json(
          {
            error: options.errorMessage || 'Permission denied',
            message: error.message,
            permission: error.permissionKey,
          },
          { status: 403 }
        );
      }

      // Handle authentication errors
      if (error instanceof Error && error.message.includes('Unauthorized')) {
        return NextResponse.json(
          {
            error: 'Unauthorized',
            message: error.message,
          },
          { status: 401 }
        );
      }

      // Handle other errors
      console.error('Error in protected route:', error);
      return NextResponse.json(
        {
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  };
}

