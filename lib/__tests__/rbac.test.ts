/**
 * Unit tests for RBAC functions
 *
 * Run with: pnpm test (after setting up test framework)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getUserPermissions,
  hasPermission,
  assertPermission,
  hasAnyPermission,
  hasAllPermissions,
  PermissionDeniedError,
} from '../rbac';
import { db } from '@/server/db';
import { PERMISSION_KEYS } from '@/types/rbac';

// Mock the database
vi.mock('@/server/db', () => ({
  db: {
    userRole: {
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

describe('RBAC', () => {
  const userId = 'user-123';
  const organizationId = 'org-456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserPermissions', () => {
    it('should return empty array when user has no roles', async () => {
      vi.mocked(db.userRole.findMany).mockResolvedValue([]);

      const permissions = await getUserPermissions(userId, organizationId);

      expect(permissions).toEqual([]);
      expect(db.userRole.findMany).toHaveBeenCalledWith({
        where: { userId, organizationId },
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
    });

    it('should return unique permissions from user roles', async () => {
      vi.mocked(db.userRole.findMany).mockResolvedValue([
        {
          id: 'ur-1',
          userId,
          organizationId,
          roleId: 'role-1',
          createdAt: new Date(),
          role: {
            id: 'role-1',
            key: 'FINANCE_ADMIN',
            label: 'Finance Admin',
            rolePermissions: [
              {
                id: 'rp-1',
                roleId: 'role-1',
                permissionId: 'perm-1',
                permission: {
                  id: 'perm-1',
                  key: PERMISSION_KEYS.CREATE_STREAM,
                  label: 'Create Stream',
                },
              },
              {
                id: 'rp-2',
                roleId: 'role-1',
                permissionId: 'perm-2',
                permission: {
                  id: 'perm-2',
                  key: PERMISSION_KEYS.APPROVE_PAYROLL,
                  label: 'Approve Payroll',
                },
              },
            ],
          },
        },
        {
          id: 'ur-2',
          userId,
          organizationId,
          roleId: 'role-2',
          createdAt: new Date(),
          role: {
            id: 'role-2',
            key: 'MANAGER',
            label: 'Manager',
            rolePermissions: [
              {
                id: 'rp-3',
                roleId: 'role-2',
                permissionId: 'perm-1',
                permission: {
                  id: 'perm-1',
                  key: PERMISSION_KEYS.CREATE_STREAM, // Duplicate
                  label: 'Create Stream',
                },
              },
              {
                id: 'rp-4',
                roleId: 'role-2',
                permissionId: 'perm-3',
                permission: {
                  id: 'perm-3',
                  key: PERMISSION_KEYS.VIEW_FINANCE_DASHBOARD,
                  label: 'View Finance Dashboard',
                },
              },
            ],
          },
        },
      ]);

      const permissions = await getUserPermissions(userId, organizationId);

      // Should return unique permissions (CREATE_STREAM appears twice but should only be once)
      expect(permissions).toHaveLength(3);
      expect(permissions).toContain(PERMISSION_KEYS.CREATE_STREAM);
      expect(permissions).toContain(PERMISSION_KEYS.APPROVE_PAYROLL);
      expect(permissions).toContain(PERMISSION_KEYS.VIEW_FINANCE_DASHBOARD);
    });
  });

  describe('hasPermission', () => {
    it('should return true when user has the permission', async () => {
      vi.mocked(db.userRole.findMany).mockResolvedValue([
        {
          id: 'ur-1',
          userId,
          organizationId,
          roleId: 'role-1',
          createdAt: new Date(),
          role: {
            id: 'role-1',
            key: 'FINANCE_ADMIN',
            label: 'Finance Admin',
            rolePermissions: [
              {
                id: 'rp-1',
                roleId: 'role-1',
                permissionId: 'perm-1',
                permission: {
                  id: 'perm-1',
                  key: PERMISSION_KEYS.CREATE_STREAM,
                  label: 'Create Stream',
                },
              },
            ],
          },
        },
      ]);

      const hasAccess = await hasPermission(
        userId,
        organizationId,
        PERMISSION_KEYS.CREATE_STREAM
      );

      expect(hasAccess).toBe(true);
    });

    it('should return false when user does not have the permission', async () => {
      vi.mocked(db.userRole.findMany).mockResolvedValue([
        {
          id: 'ur-1',
          userId,
          organizationId,
          roleId: 'role-1',
          createdAt: new Date(),
          role: {
            id: 'role-1',
            key: 'EMPLOYEE',
            label: 'Employee',
            rolePermissions: [
              {
                id: 'rp-1',
                roleId: 'role-1',
                permissionId: 'perm-1',
                permission: {
                  id: 'perm-1',
                  key: PERMISSION_KEYS.VIEW_SELF_STREAMS,
                  label: 'View Self Streams',
                },
              },
            ],
          },
        },
      ]);

      const hasAccess = await hasPermission(
        userId,
        organizationId,
        PERMISSION_KEYS.CREATE_STREAM
      );

      expect(hasAccess).toBe(false);
    });
  });

  describe('assertPermission', () => {
    it('should not throw when user has the permission', async () => {
      vi.mocked(db.userRole.findMany).mockResolvedValue([
        {
          id: 'ur-1',
          userId,
          organizationId,
          roleId: 'role-1',
          createdAt: new Date(),
          role: {
            id: 'role-1',
            key: 'FINANCE_ADMIN',
            label: 'Finance Admin',
            rolePermissions: [
              {
                id: 'rp-1',
                roleId: 'role-1',
                permissionId: 'perm-1',
                permission: {
                  id: 'perm-1',
                  key: PERMISSION_KEYS.CREATE_STREAM,
                  label: 'Create Stream',
                },
              },
            ],
          },
        },
      ]);

      await expect(
        assertPermission(userId, organizationId, PERMISSION_KEYS.CREATE_STREAM)
      ).resolves.not.toThrow();
    });

    it('should throw PermissionDeniedError when user does not have the permission', async () => {
      vi.mocked(db.userRole.findMany).mockResolvedValue([]);
      vi.mocked(db.auditLog.create).mockResolvedValue({
        id: 'audit-1',
        organizationId,
        actorId: userId,
        action: 'PERMISSION_DENIED',
        entity: 'PERMISSION',
        entityId: PERMISSION_KEYS.CREATE_STREAM,
        before: null,
        after: {},
        hash: 'hash',
        createdAt: new Date(),
        ip: null,
        userAgent: null,
      });

      await expect(
        assertPermission(userId, organizationId, PERMISSION_KEYS.CREATE_STREAM, 'test context')
      ).rejects.toThrow(PermissionDeniedError);

      // Verify audit log was created
      expect(db.auditLog.create).toHaveBeenCalled();
    });

    it('should log to audit log when permission is denied', async () => {
      vi.mocked(db.userRole.findMany).mockResolvedValue([]);
      vi.mocked(db.auditLog.create).mockResolvedValue({
        id: 'audit-1',
        organizationId,
        actorId: userId,
        action: 'PERMISSION_DENIED',
        entity: 'PERMISSION',
        entityId: PERMISSION_KEYS.CREATE_STREAM,
        before: null,
        after: {},
        hash: 'hash',
        createdAt: new Date(),
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      });

      try {
        await assertPermission(
          userId,
          organizationId,
          PERMISSION_KEYS.CREATE_STREAM,
          'test context',
          { ip: '127.0.0.1', userAgent: 'test-agent' }
        );
      } catch (error) {
        // Expected to throw
      }

      expect(db.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId,
          actorId: userId,
          action: 'PERMISSION_DENIED',
          entity: 'PERMISSION',
          entityId: PERMISSION_KEYS.CREATE_STREAM,
          ip: '127.0.0.1',
          userAgent: 'test-agent',
        }),
      });
    });
  });

  describe('hasAnyPermission', () => {
    it('should return true when user has at least one permission', async () => {
      vi.mocked(db.userRole.findMany).mockResolvedValue([
        {
          id: 'ur-1',
          userId,
          organizationId,
          roleId: 'role-1',
          createdAt: new Date(),
          role: {
            id: 'role-1',
            key: 'MANAGER',
            label: 'Manager',
            rolePermissions: [
              {
                id: 'rp-1',
                roleId: 'role-1',
                permissionId: 'perm-1',
                permission: {
                  id: 'perm-1',
                  key: PERMISSION_KEYS.APPROVE_PAYROLL,
                  label: 'Approve Payroll',
                },
              },
            ],
          },
        },
      ]);

      const hasAccess = await hasAnyPermission(userId, organizationId, [
        PERMISSION_KEYS.APPROVE_PAYROLL,
        PERMISSION_KEYS.CREATE_STREAM,
      ]);

      expect(hasAccess).toBe(true);
    });

    it('should return false when user has none of the permissions', async () => {
      vi.mocked(db.userRole.findMany).mockResolvedValue([
        {
          id: 'ur-1',
          userId,
          organizationId,
          roleId: 'role-1',
          createdAt: new Date(),
          role: {
            id: 'role-1',
            key: 'EMPLOYEE',
            label: 'Employee',
            rolePermissions: [
              {
                id: 'rp-1',
                roleId: 'role-1',
                permissionId: 'perm-1',
                permission: {
                  id: 'perm-1',
                  key: PERMISSION_KEYS.VIEW_SELF_STREAMS,
                  label: 'View Self Streams',
                },
              },
            ],
          },
        },
      ]);

      const hasAccess = await hasAnyPermission(userId, organizationId, [
        PERMISSION_KEYS.APPROVE_PAYROLL,
        PERMISSION_KEYS.CREATE_STREAM,
      ]);

      expect(hasAccess).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('should return true when user has all permissions', async () => {
      vi.mocked(db.userRole.findMany).mockResolvedValue([
        {
          id: 'ur-1',
          userId,
          organizationId,
          roleId: 'role-1',
          createdAt: new Date(),
          role: {
            id: 'role-1',
            key: 'FINANCE_ADMIN',
            label: 'Finance Admin',
            rolePermissions: [
              {
                id: 'rp-1',
                roleId: 'role-1',
                permissionId: 'perm-1',
                permission: {
                  id: 'perm-1',
                  key: PERMISSION_KEYS.CREATE_STREAM,
                  label: 'Create Stream',
                },
              },
              {
                id: 'rp-2',
                roleId: 'role-1',
                permissionId: 'perm-2',
                permission: {
                  id: 'perm-2',
                  key: PERMISSION_KEYS.APPROVE_PAYROLL,
                  label: 'Approve Payroll',
                },
              },
            ],
          },
        },
      ]);

      const hasAccess = await hasAllPermissions(userId, organizationId, [
        PERMISSION_KEYS.CREATE_STREAM,
        PERMISSION_KEYS.APPROVE_PAYROLL,
      ]);

      expect(hasAccess).toBe(true);
    });

    it('should return false when user is missing any permission', async () => {
      vi.mocked(db.userRole.findMany).mockResolvedValue([
        {
          id: 'ur-1',
          userId,
          organizationId,
          roleId: 'role-1',
          createdAt: new Date(),
          role: {
            id: 'role-1',
            key: 'MANAGER',
            label: 'Manager',
            rolePermissions: [
              {
                id: 'rp-1',
                roleId: 'role-1',
                permissionId: 'perm-1',
                permission: {
                  id: 'perm-1',
                  key: PERMISSION_KEYS.APPROVE_PAYROLL,
                  label: 'Approve Payroll',
                },
              },
            ],
          },
        },
      ]);

      const hasAccess = await hasAllPermissions(userId, organizationId, [
        PERMISSION_KEYS.APPROVE_PAYROLL,
        PERMISSION_KEYS.CREATE_STREAM,
      ]);

      expect(hasAccess).toBe(false);
    });
  });
});

