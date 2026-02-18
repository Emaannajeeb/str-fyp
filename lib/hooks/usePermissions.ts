/**
 * React hook to fetch and use user permissions
 */

import { useState, useEffect } from 'react';
import { PermissionKey } from '@/types/rbac';

export function usePermissions() {
  const [permissions, setPermissions] = useState<PermissionKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const response = await fetch('/api/me/permissions');
        if (!response.ok) {
          throw new Error('Failed to fetch permissions');
        }
        const data = await response.json();
        setPermissions(data.permissions || []);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, []);

  const hasPermission = (permission: PermissionKey): boolean => {
    return permissions.includes(permission);
  };

  const hasAnyPermission = (permissionList: PermissionKey[]): boolean => {
    return permissionList.some((perm) => permissions.includes(perm));
  };

  const hasAllPermissions = (permissionList: PermissionKey[]): boolean => {
    return permissionList.every((perm) => permissions.includes(perm));
  };

  return {
    permissions,
    loading,
    error,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };
}

