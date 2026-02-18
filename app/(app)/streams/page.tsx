'use client';

import { useState, useEffect } from 'react';
import { Plus, Wallet, ArrowRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';
import { useToastStore } from '@/lib/store/toast';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { PERMISSION_KEYS } from '@/types/rbac';

interface Stream {
  id: string;
  streamflowStreamId: string | null;
  onchainTx: string | null;
  explorerUrl: string | null;
  status: string;
  tokenSymbol: string;
  totalAmount: string;
  startTime: string;
  endTime: string;
  employee: {
    id: string;
    displayName: string;
  };
}

export default function StreamsPage() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const { error: showError } = useToastStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const canCreateStream = hasPermission(PERMISSION_KEYS.CREATE_STREAM);

  useEffect(() => {
    loadStreams();
  }, []);

  const loadStreams = async () => {
    try {
      const response = await fetch('/api/streams');
      if (!response.ok) {
        throw new Error('Failed to load streams');
      }
      const data = await response.json();
      setStreams(data.streams || []);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load streams');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      ACTIVE: { bg: 'bg-green-100', text: 'text-green-800', label: 'Active' },
      PAUSED: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Paused' },
      COMPLETED: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Completed' },
      CANCELLED: { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' },
      PENDING: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Pending' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.PENDING;

    return (
      <span className={`rounded-full px-2 py-1 text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  return (
    <div>
      <PageHeader
        title="Streams"
        description="View and manage payment streams"
        action={
          canCreateStream && !permissionsLoading ? (
            <Link
              href="/contracts"
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Create Stream
            </Link>
          ) : null
        }
      />

      {loading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : streams.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No streams yet"
          description={
            canCreateStream
              ? 'Create your first payroll stream by creating a contract, getting it approved, and then creating a stream.'
              : 'No payment streams have been created yet.'
          }
          action={
            canCreateStream && !permissionsLoading ? (
              <Link
                href="/contracts"
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Create Your First Stream
              </Link>
            ) : null
          }
        />
      ) : (
        <div className="space-y-4">
          {streams.map((stream) => (
            <Link
              key={stream.id}
              href={`/streams/${stream.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <Wallet className="h-5 w-5 text-gray-400" />
                    <h3 className="font-semibold text-gray-900">{stream.employee.displayName}</h3>
                    {getStatusBadge(stream.status)}
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    {stream.tokenSymbol} {parseFloat(stream.totalAmount).toLocaleString()}
                  </p>
                  {stream.streamflowStreamId && (
                    <p className="mt-1 font-mono text-xs text-gray-500">
                      Streamflow ID: {stream.streamflowStreamId.slice(0, 20)}...
                    </p>
                  )}
                  {stream.onchainTx && (
                    <div className="mt-1 flex items-center gap-2">
                      <p className="font-mono text-xs text-gray-500">
                        TX: {stream.onchainTx.slice(0, 20)}...
                      </p>
                      {stream.explorerUrl && (
                        <a
                          href={stream.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3 w-3" />
                          View on Explorer
                        </a>
                      )}
                    </div>
                  )}
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
