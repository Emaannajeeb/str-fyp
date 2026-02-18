/**
 * Audit Logs API
 * GET: Fetch audit logs with filtering
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { z } from 'zod';

const auditLogQuerySchema = z.object({
  actorId: z.string().optional(),
  entity: z.string().optional(),
  action: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

async function getAuditLogsHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const { searchParams } = new URL(request.url);
    const query = auditLogQuerySchema.parse({
      actorId: searchParams.get('actorId') || undefined,
      entity: searchParams.get('entity') || undefined,
      action: searchParams.get('action') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '50',
    });

    // Build proper where clause for Prisma
    const prismaWhere: {
      organizationId: string;
      actorId?: string;
      entity?: string;
      action?: string;
      createdAt?: {
        gte?: Date;
        lte?: Date;
      };
    } = {
      organizationId: session.organizationId,
    };

    if (query.actorId) {
      // Try to find user by email first
      const user = await db.user.findUnique({
        where: { email: query.actorId },
        select: { id: true },
      });
      if (user) {
        prismaWhere.actorId = user.id;
      } else {
        // If not found, assume it's a user ID
        prismaWhere.actorId = query.actorId;
      }
    }

    if (query.entity) {
      prismaWhere.entity = query.entity;
    }

    if (query.action) {
      prismaWhere.action = query.action;
    }

    if (query.startDate || query.endDate) {
      prismaWhere.createdAt = {};
      if (query.startDate) {
        prismaWhere.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        prismaWhere.createdAt.lte = new Date(query.endDate);
      }
    }

    // Get total count
    const total = await db.auditLog.count({ where: prismaWhere });

    // Get audit logs with pagination
    const logs = await db.auditLog.findMany({
      where: prismaWhere,
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return NextResponse.json({
      logs,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: 'Failed to fetch audit logs',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(getAuditLogsHandler, {
  requiredPermissions: ['VIEW_AUDIT'],
});

