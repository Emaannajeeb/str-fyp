/**
 * Audit Reports API
 * GET: List all generated reports for the organization
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';

async function listReportsHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const reports = await db.auditReport.findMany({
      where: {
        organizationId: session.organizationId,
      },
      include: {
        creator: {
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

    return NextResponse.json({
      reports: reports.map((report) => ({
        id: report.id,
        reportType: report.reportType,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        fileName: report.fileName,
        filePath: report.filePath,
        fileSize: report.fileSize,
        hash: report.hash,
        createdAt: report.createdAt,
        createdBy: report.creator
          ? {
              email: report.creator.email,
              name: report.creator.name,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error('List reports error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch reports',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(listReportsHandler, {
  requiredPermissions: ['VIEW_AUDIT'],
});

