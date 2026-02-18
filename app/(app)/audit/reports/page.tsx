'use client';

import { useState, useEffect } from 'react';
import { Download, FileText, Calendar, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

interface AuditReport {
  id: string;
  reportType: string;
  periodStart: string;
  periodEnd: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  hash: string;
  createdAt: string;
  createdBy: {
    email: string;
    name: string | null;
  } | null;
}

export default function AuditReportsPage() {
  const [reports, setReports] = useState<AuditReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/audit/reports');
      if (!response.ok) {
        throw new Error('Failed to load reports');
      }
      const data = await response.json();
      setReports(data.reports);
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Audit Reports</h1>
        <p className="mt-2 text-gray-600">
          Download generated PDF audit reports for compliance and record-keeping.
        </p>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-600">
          Loading reports...
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">No reports generated yet.</p>
          <a
            href="/audit"
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Go to Audit Center to generate a report
          </a>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Report Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Period
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  File Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Size
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hash
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {report.reportType}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span>
                        {format(new Date(report.periodStart), 'MMM d, yyyy')} -{' '}
                        {format(new Date(report.periodEnd), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span className="font-mono text-xs">{report.fileName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {formatFileSize(report.fileSize)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {format(new Date(report.createdAt), 'MMM d, yyyy HH:mm')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                    <span title={report.hash}>{report.hash.substring(0, 16)}...</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <a
                      href={report.filePath}
                      download={report.fileName}
                      className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Hash Verification Info */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
        <div className="flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-blue-900 mb-2">
              Report Integrity Verification
            </h3>
            <p className="text-sm text-blue-800 mb-2">
              Each PDF report includes a SHA-256 hash for integrity verification. To verify a
              report:
            </p>
            <ol className="text-sm text-blue-800 list-decimal list-inside space-y-1 ml-2">
              <li>Download the PDF file</li>
              <li>Compute SHA-256 hash of the file: <code className="bg-blue-100 px-1 rounded">sha256sum filename.pdf</code></li>
              <li>Compare the computed hash with the hash shown in the table above</li>
              <li>If they match, the report has not been tampered with</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

