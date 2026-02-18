/**
 * Generate Monthly PDF Report
 * POST: Generate and store a monthly audit report
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { generateMonthlyReport } from '@/server/audit/pdf-generator';
import { z } from 'zod';

const generateReportSchema = z.object({
  reportType: z.enum(['MONTHLY', 'CUSTOM']),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});

async function generateReportHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const body = await request.json();
    const { reportType, periodStart, periodEnd } = generateReportSchema.parse(body);

    const startDate = new Date(periodStart);
    const endDate = new Date(periodEnd);

    // Generate PDF
    const { filePath, fileName, fileSize, hash } = await generateMonthlyReport(
      session.organizationId,
      startDate,
      endDate,
      session.userId
    );

    // Store report record in database
    const report = await db.auditReport.create({
      data: {
        organizationId: session.organizationId,
        reportType,
        periodStart: startDate,
        periodEnd: endDate,
        fileName,
        filePath,
        fileSize,
        hash,
        createdBy: session.userId,
      },
    });

    return NextResponse.json({
      success: true,
      report: {
        id: report.id,
        fileName: report.fileName,
        filePath: report.filePath,
        fileSize: report.fileSize,
        hash: report.hash,
        createdAt: report.createdAt,
      },
    });
  } catch (error) {
    console.error('Generate report error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: 'Failed to generate report',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const POST = withAuthAndRBAC(generateReportHandler, {
  requiredPermissions: ['VIEW_AUDIT'],
});

