/**
 * Audit logging utilities for authentication events
 */

import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { db } from '../db';

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export interface AuditLogData {
  organizationId: string;
  actorId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(data: AuditLogData): Promise<void> {
  try {
    const auditData = {
      action: data.action,
      entity: data.entity,
      entityId: data.entityId,
      timestamp: new Date().toISOString(),
      before: data.before,
      after: data.after,
    };

    // Create hash for integrity
    const hashInput = JSON.stringify({
      organizationId: data.organizationId,
      actorId: data.actorId,
      ...auditData,
    });
    const hash = createHash('sha256').update(hashInput).digest('hex');

    await db.auditLog.create({
      data: {
        organizationId: data.organizationId,
        actorId: data.actorId || null,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        ...(data.before != null ? { before: toInputJsonValue(data.before) } : {}),
        ...(data.after != null ? { after: toInputJsonValue(data.after) } : {}),
        hash,
        ip: data.ip || null,
        userAgent: data.userAgent || null,
      },
    });
  } catch (error) {
    // Log error but don't throw - audit logging failure shouldn't break the flow
    console.error('Failed to create audit log:', error);
  }
}

/**
 * Get request metadata for audit logging
 */
export function getRequestMetadata(request: Request): {
  ip: string | undefined;
  userAgent: string | undefined;
} {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  return { ip, userAgent };
}

