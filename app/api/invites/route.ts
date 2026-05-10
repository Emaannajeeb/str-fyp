/**
 * Invites API
 * GET: List invites for the organization
 * POST: Create invite (roleId, optional expiresInDays)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';
import { randomBytes } from 'crypto';
import { z } from 'zod';

function generateInviteCode(): string {
  return randomBytes(8)
    .toString('base64url')
    .replace(/[-_]/g, (c) => (c === '-' ? 'A' : 'B'));
}

async function listInvitesHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const invites = await db.invite.findMany({
      where: { organizationId: session.organizationId },
      include: {
        role: { select: { key: true, label: true } },
        createdBy: { select: { email: true, name: true } },
        usedBy: { select: { email: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      invites: invites.map((inv) => ({
        id: inv.id,
        code: inv.code,
        role: inv.role,
        expiresAt: inv.expiresAt,
        usedAt: inv.usedAt,
        usedBy: inv.usedBy,
        createdBy: inv.createdBy,
        createdAt: inv.createdAt,
      })),
    });
  } catch (error) {
    console.error('List invites error:', error);
    return NextResponse.json(
      {
        error: 'Failed to list invites',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

const createInviteSchema = z.object({
  roleId: z.string().min(1, 'Role is required'),
  expiresInDays: z.number().int().min(1).max(365).optional().default(7),
});

async function createInviteHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const body = await request.json();
    const { roleId, expiresInDays } = createInviteSchema.parse(body);
    const metadata = getRequestMetadata(request);

    const role = await db.role.findFirst({
      where: { id: roleId },
    });
    if (!role) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    let code = generateInviteCode();
    while (await db.invite.findUnique({ where: { code } })) {
      code = generateInviteCode();
    }

    const invite = await db.invite.create({
      data: {
        code,
        organizationId: session.organizationId,
        roleId,
        createdById: session.userId,
        expiresAt,
      },
      include: {
        role: { select: { key: true, label: true } },
      },
    });

    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: 'CREATE',
      entity: 'INVITE',
      entityId: invite.id,
      after: { code: invite.code, roleId, expiresAt: invite.expiresAt },
      ...metadata,
    });

    const appBase = process.env.APP_BASE_URL ?? '';
    const inviteLink = appBase
      ? `${appBase}/signin?invite=${encodeURIComponent(invite.code)}`
      : invite.code;

    return NextResponse.json({
      success: true,
      invite: {
        id: invite.id,
        code: invite.code,
        role: invite.role,
        expiresAt: invite.expiresAt,
        link: inviteLink,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.flatten() },
        { status: 400 }
      );
    }
    console.error('Create invite error:', error);
    return NextResponse.json(
      {
        error: 'Failed to create invite',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(listInvitesHandler, {
  requiredPermissions: 'MANAGE_ROLES',
});

export const POST = withAuthAndRBAC(createInviteHandler, {
  requiredPermissions: 'MANAGE_ROLES',
});
