'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, Clock, FileText } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';
import { useToastStore } from '@/lib/store/toast';

interface Approval {
  id: string;
  subjectType: string;
  subjectId: string;
  step: number;
  status: string;
  approverId: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { success, error: showError } = useToastStore();

  // Request form state
  const [subjectType, setSubjectType] = useState<'CONTRACT' | 'STREAM'>('CONTRACT');
  const [subjectId, setSubjectId] = useState('');

  useEffect(() => {
    loadApprovals();
  }, []);

  const loadApprovals = async () => {
    try {
      // For demo, we'll show a placeholder
      // In production, fetch from /api/approvals
      setLoading(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load approvals');
      setLoading(false);
    }
  };

  const handleRequestApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch('/api/approvals/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subjectType,
          subjectId,
          step: 1,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to request approval');
      }

      setSubjectId('');
      setShowRequestForm(false);
      await loadApprovals();
      success('Approval requested successfully');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to request approval');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (approvalId: string) => {
    try {
      const response = await fetch('/api/approvals/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          approvalId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve');
      }

      await loadApprovals();
      success('Approval processed successfully');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to approve');
    }
  };

  return (
    <div>
      <PageHeader
        title="Approvals"
        description="Manage approval requests and approvals"
        action={
          <button
            onClick={() => setShowRequestForm(!showRequestForm)}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <CheckCircle2 className="h-4 w-4" />
            Request Approval
          </button>
        }
      />

      {showRequestForm && (
        <form
          onSubmit={handleRequestApproval}
          className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-semibold">Request Approval</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="subjectType" className="block text-sm font-medium text-gray-700">
                Subject Type
              </label>
              <select
                id="subjectType"
                value={subjectType}
                onChange={(e) => setSubjectType(e.target.value as 'CONTRACT' | 'STREAM')}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
              >
                <option value="CONTRACT">Contract</option>
                <option value="STREAM">Stream</option>
              </select>
            </div>
            <div>
              <label htmlFor="subjectId" className="block text-sm font-medium text-gray-700">
                Subject ID
              </label>
              <input
                id="subjectId"
                type="text"
                required
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                placeholder="Enter Contract or Stream ID"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Requesting...' : 'Request Approval'}
              </button>
              <button
                type="button"
                onClick={() => setShowRequestForm(false)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {loading ? (
        <TableSkeleton rows={5} columns={5} />
      ) : approvals.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No pending approvals"
          description="Request approvals for contracts or streams to see them here. Once requested, they will appear in your approval queue."
        />
      ) : (
        <div className="space-y-4">
          {approvals.map((approval) => (
            <div
              key={approval.id}
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <span className="font-semibold">{approval.subjectType}</span>
                    <span className="text-sm text-gray-500">({approval.subjectId.slice(0, 8)}...)</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">Step {approval.step}</p>
                </div>
                {approval.status === 'PENDING' && (
                  <button
                    onClick={() => handleApprove(approval.id)}
                    className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                  >
                    Approve
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
