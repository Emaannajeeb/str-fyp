/**
 * RBAC (Role-Based Access Control) Library
 *
 * Provides functions to check user permissions based on their roles
 * within an organization context.
 */

import { db } from '@/server/db';
import { PermissionKey } from '@/types/rbac';
import { createHash } from 'crypto';

/**
 * Custom error class for permission denials
 */
export class PermissionDeniedError extends Error {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly permissionKey: PermissionKey,
    public readonly context?: string
  ) {
    super(
      `Permission denied: User ${userId} does not have permission ${permissionKey} in organization ${organizationId}${context ? ` (${context})` : ''}`
    );
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Get all permissions for a user within an organization
 *
 * @param userId - The user ID
 * @param organizationId - The organization ID
 * @returns Array of permission keys the user has
 */
export async function getUserPermissions(
  userId: string,
  organizationId: string
): Promise<PermissionKey[]> {
  // Verify organization exists first
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });

  // If organization doesn't exist, return empty permissions
  if (!organization) {
    console.warn(`Organization ${organizationId} does not exist for user ${userId}`);
    return [];
  }

  // Get all user roles for this organization
  const userRoles = await db.userRole.findMany({
    where: {
      userId,
      organizationId,
    },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  // Extract unique permission keys
  const permissionKeys = new Set<PermissionKey>();
  for (const userRole of userRoles) {
    for (const rolePermission of userRole.role.rolePermissions) {
      permissionKeys.add(rolePermission.permission.key as PermissionKey);
    }
  }

  return Array.from(permissionKeys);
}

/**
 * Check if a user has a specific permission within an organization
 *
 * @param userId - The user ID
 * @param organizationId - The organization ID
 * @param permissionKey - The permission key to check
 * @returns True if the user has the permission, false otherwise
 */
export async function hasPermission(
  userId: string,
  organizationId: string,
  permissionKey: PermissionKey
): Promise<boolean> {
  const permissions = await getUserPermissions(userId, organizationId);
  return permissions.includes(permissionKey);
}

/**
 * Assert that a user has a specific permission within an organization
 * Throws PermissionDeniedError if the user doesn't have the permission
 * and logs the denial to the audit log
 *
 * @param userId - The user ID
 * @param organizationId - The organization ID
 * @param permissionKey - The permission key to check
 * @param context - Optional context string for logging (e.g., route path, action description)
 * @param requestMetadata - Optional request metadata for audit logging
 * @throws PermissionDeniedError if the user doesn't have the permission
 */
export async function assertPermission(
  userId: string,
  organizationId: string,
  permissionKey: PermissionKey,
  context?: string,
  requestMetadata?: {
    ip?: string;
    userAgent?: string;
  }
): Promise<void> {
  const hasAccess = await hasPermission(userId, organizationId, permissionKey);

  if (!hasAccess) {
    // Log the denial to audit log
    await logPermissionDenial(userId, organizationId, permissionKey, context, requestMetadata);

    // Throw error
    throw new PermissionDeniedError(userId, organizationId, permissionKey, context);
  }
}

/**
 * Log a permission denial to the audit log
 *
 * @param userId - The user ID
 * @param organizationId - The organization ID
 * @param permissionKey - The permission key that was denied
 * @param context - Optional context string
 * @param requestMetadata - Optional request metadata
 */
async function logPermissionDenial(
  userId: string,
  organizationId: string,
  permissionKey: PermissionKey,
  context?: string,
  requestMetadata?: {
    ip?: string;
    userAgent?: string;
  }
): Promise<void> {
  try {
    // Verify organization exists before trying to create audit log
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });

    // If organization doesn't exist, skip audit logging
    // This can happen if the organization was deleted but session still references it
    if (!organization) {
      console.warn(
        `Cannot log permission denial: Organization ${organizationId} does not exist. User: ${userId}, Permission: ${permissionKey}`
      );
      return;
    }

    const auditData = {
      action: 'PERMISSION_DENIED',
      permission: permissionKey,
      context: context || null,
      timestamp: new Date().toISOString(),
    };

    // Create a hash of the audit log entry for integrity
    const hashInput = JSON.stringify({
      userId,
      organizationId,
      ...auditData,
    });
    const hash = createHash('sha256').update(hashInput).digest('hex');

    await db.auditLog.create({
      data: {
        organizationId,
        actorId: userId,
        action: 'PERMISSION_DENIED',
        entity: 'PERMISSION',
        entityId: permissionKey || 'UNKNOWN',
        before: null,
        after: auditData,
        hash,
        ip: requestMetadata?.ip || null,
        userAgent: requestMetadata?.userAgent || null,
      },
    });
  } catch (error) {
    // Log error but don't throw - audit logging failure shouldn't break the flow
    console.error('Failed to log permission denial to audit log:', error);
  }
}

/**
 * Check if a user has any of the specified permissions (OR logic)
 *
 * @param userId - The user ID
 * @param organizationId - The organization ID
 * @param permissionKeys - Array of permission keys to check
 * @returns True if the user has at least one of the permissions
 */
export async function hasAnyPermission(
  userId: string,
  organizationId: string,
  permissionKeys: PermissionKey[]
): Promise<boolean> {
  const userPermissions = await getUserPermissions(userId, organizationId);
  return permissionKeys.some((key) => userPermissions.includes(key));
}

/**
 * Check if a user has all of the specified permissions (AND logic)
 *
 * @param userId - The user ID
 * @param organizationId - The organization ID
 * @param permissionKeys - Array of permission keys to check
 * @returns True if the user has all of the permissions
 */
export async function hasAllPermissions(
  userId: string,
  organizationId: string,
  permissionKeys: PermissionKey[]
): Promise<boolean> {
  const userPermissions = await getUserPermissions(userId, organizationId);
  return permissionKeys.every((key) => userPermissions.includes(key));
}

