/**
 * RBAC (Role-Based Access Control) Type Definitions
 *
 * This file defines all permission keys used throughout the application.
 * Permissions are checked at runtime via the RBAC library functions.
 */

/**
 * Permission keys for the application
 * These keys must match the permission keys in the database
 */
export const PERMISSION_KEYS = {
  // Stream permissions
  CREATE_STREAM: 'CREATE_STREAM',
  PAUSE_STREAM: 'PAUSE_STREAM',
  CANCEL_STREAM: 'CANCEL_STREAM',
  FUND_STREAM: 'FUND_STREAM',

  // Payroll permissions
  APPROVE_PAYROLL: 'APPROVE_PAYROLL',

  // Employee management
  MANAGE_EMPLOYEES: 'MANAGE_EMPLOYEES',

  // Audit and viewing permissions
  VIEW_AUDIT: 'VIEW_AUDIT',
  VIEW_FINANCE_DASHBOARD: 'VIEW_FINANCE_DASHBOARD',
  VIEW_SELF_STREAMS: 'VIEW_SELF_STREAMS',

  // Contract permissions (legacy, kept for backward compatibility)
  CREATE_CONTRACT: 'CREATE_CONTRACT',
  EDIT_CONTRACT: 'EDIT_CONTRACT',
  DELETE_CONTRACT: 'DELETE_CONTRACT',

  // Budget permissions (legacy, kept for backward compatibility)
  VIEW_BUDGET: 'VIEW_BUDGET',
  MANAGE_BUDGET: 'MANAGE_BUDGET',

  // Role management (legacy, kept for backward compatibility)
  MANAGE_ROLES: 'MANAGE_ROLES',
} as const;

/**
 * Type for permission keys
 */
export type PermissionKey = (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS];

/**
 * Array of all permission keys for validation
 */
export const ALL_PERMISSION_KEYS = Object.values(PERMISSION_KEYS);

/**
 * Role keys
 */
export const ROLE_KEYS = {
  SYS_ADMIN: 'SYS_ADMIN',
  FINANCE_ADMIN: 'FINANCE_ADMIN',
  MANAGER: 'MANAGER',
  HR: 'HR',
  EMPLOYEE: 'EMPLOYEE',
  AUDITOR: 'AUDITOR',
} as const;

/**
 * Type for role keys
 */
export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

