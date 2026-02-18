/**
 * PDF Report Generator for Audit Logs
 * Uses pdfmake to generate monthly audit reports
 */

import { db } from '../db';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import { createHash } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// Dynamic import for pdfmake (CommonJS module)
let PdfPrinter: any;
async function getPdfPrinter() {
  if (!PdfPrinter) {
    const pdfmake = await import('pdfmake');
    PdfPrinter = pdfmake.default || pdfmake;
  }
  return PdfPrinter;
}

// Fonts configuration - using minimal fonts for server-side generation
// In production, you might want to load actual font files
const getFonts = () => ({
  Roboto: {
    normal: Buffer.from(''),
    bold: Buffer.from(''),
    italics: Buffer.from(''),
    bolditalics: Buffer.from(''),
  },
});

export interface MonthlyReportData {
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  periodStart: Date;
  periodEnd: Date;
  streams: Array<{
    id: string;
    streamflowStreamId: string | null;
    onchainTx: string | null;
    status: string;
    totalAmount: string;
    tokenSymbol: string;
    employeeName: string;
    createdAt: Date;
    configHash?: string;
  }>;
  approvals: Array<{
    id: string;
    subjectType: string;
    subjectId: string;
    status: string;
    approverEmail: string | null;
    createdAt: Date;
    approvedAt: Date | null;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    entity: string;
    entityId: string;
    actorEmail: string | null;
    createdAt: Date;
    hash: string | null;
  }>;
}

/**
 * Generate monthly PDF report
 */
export async function generateMonthlyReport(
  organizationId: string,
  periodStart: Date,
  periodEnd: Date,
  createdBy: string
): Promise<{ filePath: string; fileName: string; fileSize: number; hash: string }> {
  // Fetch organization
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, slug: true },
  });

  if (!organization) {
    throw new Error('Organization not found');
  }

  // Fetch streams created/paused/cancelled in the period
  const streams = await db.stream.findMany({
    where: {
      organizationId,
      createdAt: {
        gte: periodStart,
        lte: periodEnd,
      },
      status: {
        in: ['ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED'],
      },
    },
    include: {
      employee: {
        select: {
          displayName: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Fetch approvals in the period
  const approvals = await db.approval.findMany({
    where: {
      organizationId,
      createdAt: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
    include: {
      approver: {
        select: {
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Fetch audit logs for streams and approvals
  const streamIds = streams.map((s) => s.id);
  const approvalIds = approvals.map((a) => a.id);

  const auditLogs = await db.auditLog.findMany({
    where: {
      organizationId,
      createdAt: {
        gte: periodStart,
        lte: periodEnd,
      },
      OR: [
        { entity: 'STREAM', entityId: { in: streamIds } },
        { entity: 'APPROVAL', entityId: { in: approvalIds } },
      ],
    },
    include: {
      actor: {
        select: {
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Prepare report data
  const reportData: MonthlyReportData = {
    organization,
    periodStart,
    periodEnd,
    streams: streams.map((s) => ({
      id: s.id,
      streamflowStreamId: s.streamflowStreamId,
      onchainTx: s.onchainTx,
      status: s.status,
      totalAmount: s.totalAmount.toString(),
      tokenSymbol: s.tokenSymbol,
      employeeName: s.employee.displayName,
      createdAt: s.createdAt,
    })),
    approvals: approvals.map((a) => ({
      id: a.id,
      subjectType: a.subjectType,
      subjectId: a.subjectId,
      status: a.status,
      approverEmail: a.approver?.email || null,
      createdAt: a.createdAt,
      approvedAt: a.approvedAt,
    })),
    auditLogs: auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      actorEmail: log.actor?.email || null,
      createdAt: log.createdAt,
      hash: log.hash,
    })),
  };

  // Generate PDF document
  const docDefinition: TDocumentDefinitions = {
    content: [
      // Header
      {
        text: 'Monthly Audit Report',
        style: 'header',
        alignment: 'center',
        margin: [0, 0, 0, 20],
      },
      {
        text: organization.name,
        style: 'subheader',
        alignment: 'center',
        margin: [0, 0, 0, 10],
      },
      {
        text: `Period: ${periodStart.toLocaleDateString()} - ${periodEnd.toLocaleDateString()}`,
        style: 'subheader',
        alignment: 'center',
        margin: [0, 0, 0, 30],
      },

      // Organization Info
      {
        text: 'Organization Information',
        style: 'sectionHeader',
        margin: [0, 0, 0, 10],
      },
      {
        columns: [
          { text: 'Organization ID:', bold: true, width: 'auto' },
          { text: organization.id, width: '*' },
        ],
        margin: [0, 0, 0, 5],
      },
      {
        columns: [
          { text: 'Organization Name:', bold: true, width: 'auto' },
          { text: organization.name, width: '*' },
        ],
        margin: [0, 0, 0, 5],
      },
      {
        columns: [
          { text: 'Organization Slug:', bold: true, width: 'auto' },
          { text: organization.slug, width: '*' },
        ],
        margin: [0, 0, 0, 20],
      },

      // Streams Section
      {
        text: 'Streams Created/Paused/Cancelled',
        style: 'sectionHeader',
        margin: [0, 20, 0, 10],
      },
      {
        table: {
          headerRows: 1,
          widths: ['*', '*', '*', '*', '*', '*'],
          body: [
            [
              { text: 'Stream ID', style: 'tableHeader' },
              { text: 'On-Chain ID', style: 'tableHeader' },
              { text: 'Status', style: 'tableHeader' },
              { text: 'Amount', style: 'tableHeader' },
              { text: 'Employee', style: 'tableHeader' },
              { text: 'Created', style: 'tableHeader' },
            ],
            ...(reportData.streams.length > 0
              ? reportData.streams.map((s) => [
                  s.id.substring(0, 12) + '...',
                  s.streamflowStreamId?.substring(0, 12) + '...' || 'N/A',
                  s.status,
                  `${s.tokenSymbol} ${s.totalAmount}`,
                  s.employeeName,
                  s.createdAt.toLocaleDateString(),
                ])
              : [[{ text: 'No streams found in this period', colSpan: 6, alignment: 'center' }, '', '', '', '', '']]),
          ],
        },
        margin: [0, 0, 0, 20],
      },

      // Approvals Section
      {
        text: 'Approval Trail',
        style: 'sectionHeader',
        margin: [0, 20, 0, 10],
      },
      {
        table: {
          headerRows: 1,
          widths: ['*', '*', '*', '*', '*'],
          body: [
            [
              { text: 'Approval ID', style: 'tableHeader' },
              { text: 'Subject', style: 'tableHeader' },
              { text: 'Status', style: 'tableHeader' },
              { text: 'Approver', style: 'tableHeader' },
              { text: 'Date', style: 'tableHeader' },
            ],
            ...(reportData.approvals.length > 0
              ? reportData.approvals.map((a) => [
                  a.id.substring(0, 12) + '...',
                  `${a.subjectType} (${a.subjectId.substring(0, 8)}...)`,
                  a.status,
                  a.approverEmail || 'N/A',
                  a.approvedAt?.toLocaleDateString() || a.createdAt.toLocaleDateString(),
                ])
              : [[{ text: 'No approvals found in this period', colSpan: 5, alignment: 'center' }, '', '', '', '']]),
          ],
        },
        margin: [0, 0, 0, 20],
      },

      // Audit Logs with Hashes
      {
        text: 'Audit Log Entries',
        style: 'sectionHeader',
        margin: [0, 20, 0, 10],
      },
      {
        table: {
          headerRows: 1,
          widths: ['*', '*', '*', '*', '*'],
          body: [
            [
              { text: 'Action', style: 'tableHeader' },
              { text: 'Entity', style: 'tableHeader' },
              { text: 'Actor', style: 'tableHeader' },
              { text: 'Date', style: 'tableHeader' },
              { text: 'Hash', style: 'tableHeader' },
            ],
            ...(reportData.auditLogs.length > 0
              ? reportData.auditLogs.map((log) => [
                  log.action,
                  `${log.entity} (${log.entityId.substring(0, 8)}...)`,
                  log.actorEmail || 'System',
                  log.createdAt.toLocaleDateString(),
                  log.hash?.substring(0, 16) + '...' || 'N/A',
                ])
              : [[{ text: 'No audit logs found in this period', colSpan: 5, alignment: 'center' }, '', '', '', '']]),
          ],
        },
        margin: [0, 0, 0, 20],
      },

      // Hash Verification Instructions
      {
        text: 'Hash Verification',
        style: 'sectionHeader',
        margin: [0, 20, 0, 10],
      },
      {
        text: [
          'Each audit log entry includes a SHA-256 hash for integrity verification. ',
          'To verify a hash, compute SHA-256 of the following JSON structure:\n\n',
          {
            text: JSON.stringify(
              {
                organizationId: '...',
                actorId: '...',
                action: '...',
                entity: '...',
                entityId: '...',
                timestamp: '...',
                before: '...',
                after: '...',
              },
              null,
              2
            ),
            font: 'Courier',
            fontSize: 8,
          },
          '\n\nThe computed hash should match the hash stored in the audit log entry.',
        ],
        margin: [0, 0, 0, 20],
      },
    ],
    styles: {
      header: {
        fontSize: 24,
        bold: true,
      },
      subheader: {
        fontSize: 14,
        color: '#666',
      },
      sectionHeader: {
        fontSize: 16,
        bold: true,
        color: '#333',
      },
      tableHeader: {
        bold: true,
        fillColor: '#eeeeee',
      },
    },
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
    },
  };

  // Generate PDF
  const PdfPrinterClass = await getPdfPrinter();
  const printer = new PdfPrinterClass(getFonts());
  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  const chunks: Buffer[] = [];

  pdfDoc.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
  });

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    pdfDoc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });

  // Calculate hash
  const hash = createHash('sha256').update(pdfBuffer).digest('hex');

  // Save PDF to file system
  const reportsDir = join(process.cwd(), 'public', 'reports');
  if (!existsSync(reportsDir)) {
    await mkdir(reportsDir, { recursive: true });
  }

  const fileName = `audit-report-${organization.slug}-${periodStart.toISOString().split('T')[0]}-${periodEnd.toISOString().split('T')[0]}.pdf`;
  const filePath = join(reportsDir, fileName);
  const relativePath = `/reports/${fileName}`;

  await writeFile(filePath, pdfBuffer);

  return {
    filePath: relativePath,
    fileName,
    fileSize: pdfBuffer.length,
    hash,
  };
}

