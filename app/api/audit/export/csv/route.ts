/**
 * Export Audit Logs to CSV
 * GET: Export filtered audit logs as CSV
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
});

async function exportCsvHandler(
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
    });

    // Build where clause (same as GET handler)
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

    // Get all matching audit logs (no pagination for export)
    const logs = await db.auditLog.findMany({
      where: prismaWhere,
      include: {
        actor: {
          select: {
            email: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Get organization info
    const organization = await db.organization.findUnique({
      where: { id: session.organizationId },
      select: { name: true, slug: true },
    });

    // Generate CSV
    const csvRows: string[] = [];

    // Header
    csvRows.push(
      'Timestamp,Actor Email,Actor Name,Action,Entity,Entity ID,Before,After,Hash,IP,User Agent'
    );

    // Data rows
    for (const log of logs) {
      const before = log.before ? JSON.stringify(log.before) : '';
      const after = log.after ? JSON.stringify(log.after) : '';
      const actorEmail = log.actor?.email || '';
      const actorName = log.actor?.name || '';

      // Escape CSV values (handle commas, quotes, newlines)
      const escapeCsv = (value: string) => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      };

      csvRows.push(
        [
          log.createdAt.toISOString(),
          escapeCsv(actorEmail),
          escapeCsv(actorName),
          escapeCsv(log.action),
          escapeCsv(log.entity),
          escapeCsv(log.entityId),
          escapeCsv(before),
          escapeCsv(after),
          escapeCsv(log.hash || ''),
          escapeCsv(log.ip || ''),
          escapeCsv(log.userAgent || ''),
        ].join(',')
      );
    }

    const csvContent = csvRows.join('\n');

    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `audit-export-${organization?.slug || 'org'}-${timestamp}.csv`;

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Export CSV error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: 'Failed to export audit logs',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(exportCsvHandler, {
  requiredPermissions: ['VIEW_AUDIT'],
});

