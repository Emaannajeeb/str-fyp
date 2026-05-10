/**
 * Unit tests for RBAC guard middleware
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { withAuthAndRBAC } from './rbac-guard';
import { requireAuth } from '@/lib/auth';
import { assertPermission, hasAnyPermission, PermissionDeniedError } from '@/lib/rbac';

// Mock dependencies
vi.mock('@/lib/auth');
vi.mock('@/lib/rbac');

describe('withAuthAndRBAC', () => {
  const mockSession = {
    userId: 'user-1',
    organizationId: 'org-1',
    email: 'test@example.com',
    name: 'Test User',
  };

  const mockRequest = {
    method: 'GET',
    nextUrl: { pathname: '/api/test' },
    headers: new Headers({
      'x-forwarded-for': '127.0.0.1',
      'user-agent': 'test-agent',
    }),
  } as unknown as NextRequest;

  const emptyRouteContext = { params: Promise.resolve({}) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow access when user has required permission', async () => {
    vi.mocked(requireAuth).mockResolvedValue(mockSession);
    vi.mocked(assertPermission).mockResolvedValue(undefined);
    vi.mocked(hasAnyPermission).mockResolvedValue(true);

    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })));

    const protectedHandler = withAuthAndRBAC(handler, {
      requiredPermissions: ['VIEW_FINANCE_DASHBOARD'],
    });

    const response = await protectedHandler(mockRequest, emptyRouteContext);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(handler).toHaveBeenCalledWith(mockRequest, mockSession, { params: {} });
  });

  it('should deny access when user lacks required permission', async () => {
    vi.mocked(requireAuth).mockResolvedValue(mockSession);
    vi.mocked(hasAnyPermission).mockResolvedValue(false);
    const error = new PermissionDeniedError('user-1', 'org-1', 'VIEW_FINANCE_DASHBOARD');
    vi.mocked(assertPermission).mockRejectedValue(error);

    const handler = vi.fn();

    const protectedHandler = withAuthAndRBAC(handler, {
      requiredPermissions: ['VIEW_FINANCE_DASHBOARD'],
    });

    const response = await protectedHandler(mockRequest, emptyRouteContext);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Permission denied');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should require all permissions when requireAll is true', async () => {
    vi.mocked(requireAuth).mockResolvedValue(mockSession);
    vi.mocked(assertPermission).mockResolvedValue(undefined);

    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })));

    const protectedHandler = withAuthAndRBAC(handler, {
      requiredPermissions: ['VIEW_FINANCE_DASHBOARD', 'MANAGE_EMPLOYEES'],
      requireAll: true,
    });

    const response = await protectedHandler(mockRequest, emptyRouteContext);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(assertPermission).toHaveBeenCalledTimes(2);
    expect(assertPermission).toHaveBeenCalledWith(
      mockSession.userId,
      mockSession.organizationId,
      'VIEW_FINANCE_DASHBOARD',
      expect.any(String),
      expect.any(Object)
    );
    expect(assertPermission).toHaveBeenCalledWith(
      mockSession.userId,
      mockSession.organizationId,
      'MANAGE_EMPLOYEES',
      expect.any(String),
      expect.any(Object)
    );
  });

  it('should return 401 when user is not authenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'));

    const handler = vi.fn();

    const protectedHandler = withAuthAndRBAC(handler, {
      requiredPermissions: ['VIEW_FINANCE_DASHBOARD'],
    });

    const response = await protectedHandler(mockRequest, emptyRouteContext);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should use custom error message when provided', async () => {
    vi.mocked(requireAuth).mockResolvedValue(mockSession);
    vi.mocked(hasAnyPermission).mockResolvedValue(false);
    const error = new PermissionDeniedError('user-1', 'org-1', 'VIEW_FINANCE_DASHBOARD');
    vi.mocked(assertPermission).mockRejectedValue(error);

    const handler = vi.fn();

    const protectedHandler = withAuthAndRBAC(handler, {
      requiredPermissions: ['VIEW_FINANCE_DASHBOARD'],
      errorMessage: 'Custom error message',
    });

    const response = await protectedHandler(mockRequest, emptyRouteContext);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Custom error message');
  });
});

