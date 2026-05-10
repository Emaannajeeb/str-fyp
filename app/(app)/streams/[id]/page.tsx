'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, Wallet, Pause, X, ArrowDownToLine } from 'lucide-react';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { PERMISSION_KEYS } from '@/types/rbac';
import { useWalletStore } from '@/lib/wallet/store';
import { useToastStore } from '@/lib/store/toast';
import { withdrawStreamInBrowser } from '@/lib/streamflow/browser-client';

interface StreamDetails {
  id: string;
  streamflowStreamId: string | null;
  onchainTx: string | null;
  status: string;
  isRecipient?: boolean;
  employee: {
    id: string;
    displayName: string;
  };
  contract: {
    id: string;
    tokenSymbol: string;
    amountPerPeriod: string;
    period: string;
  };
  tokenMint: string;
  tokenSymbol: string;
  totalAmount: string;
  startTime: string;
  endTime: string;
  cliffTime: string | null;
  streamflowDetails: {
    availableAmount: string;
    withdrawnAmount: string;
    status: string;
  } | null;
}

export default function StreamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const streamId = params.id as string;

  const [stream, setStream] = useState<StreamDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const canPauseStream = hasPermission(PERMISSION_KEYS.PAUSE_STREAM);
  const canCancelStream = hasPermission(PERMISSION_KEYS.CANCEL_STREAM);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { connectedWallet } = useWalletStore();
  const { success, error: showError } = useToastStore();

  useEffect(() => {
    if (streamId) {
      loadStream();
    }
  }, [streamId]);

  const loadStream = async () => {
    try {
      const response = await fetch(`/api/streams/${streamId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load stream');
      }

      setStream(data.stream);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stream');
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async () => {
    if (!confirm('Are you sure you want to pause this stream?')) return;

    setActionLoading('pause');
    try {
      const response = await fetch('/api/streams/pause', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ streamId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to pause stream');
      }

      await loadStream();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause stream');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this stream? This action cannot be undone.')) {
      return;
    }

    setActionLoading('cancel');
    try {
      const response = await fetch('/api/streams/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ streamId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel stream');
      }

      await loadStream();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel stream');
    } finally {
      setActionLoading(null);
    }
  };

  const handleWithdraw = async () => {
    if (!stream?.streamflowStreamId || !stream.streamflowDetails) return;
    const available = Number(stream.streamflowDetails.availableAmount);
    if (available <= 0) {
      showError('No amount available to withdraw.');
      return;
    }
    if (!connectedWallet?.getStreamflowAdapter) {
      showError('Connect your Phantom wallet in Settings > Wallets to withdraw.');
      return;
    }
    setActionLoading('withdraw');
    try {
      const adapter = connectedWallet.getStreamflowAdapter();
      const amount = available.toFixed(8);
      const txId = await withdrawStreamInBrowser(stream.streamflowStreamId, amount, adapter, 9);
      await fetch('/api/streams/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamId: stream.id,
          amount,
          txSignature: txId,
        }),
      });
      success(`Withdrew ${amount} ${stream.tokenSymbol}. TX: ${txId.slice(0, 16)}...`);
      await loadStream();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !stream) {
    return (
      <div>
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">{error || 'Stream not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="mb-4 text-sm text-blue-600 hover:text-blue-700"
        >
          ← Back to Streams
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Stream Details</h1>
      </div>

      <div className="space-y-6">
        {/* Status Card */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wallet className="h-8 w-8 text-gray-400" />
              <div>
                <h2 className="text-lg font-semibold">{stream.employee.displayName}</h2>
                <p className="text-sm text-gray-600">
                  {stream.contract.tokenSymbol} Payment Stream
                </p>
              </div>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                stream.status === 'ACTIVE'
                  ? 'bg-green-100 text-green-800'
                  : stream.status === 'PAUSED'
                    ? 'bg-yellow-100 text-yellow-800'
                    : stream.status === 'COMPLETED'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-800'
              }`}
            >
              {stream.status}
            </span>
          </div>
        </div>

        {/* Stream Info */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold">Stream Information</h3>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Total Amount</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {stream.totalAmount} {stream.tokenSymbol}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Start Date</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {new Date(stream.startTime).toLocaleDateString()}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">End Date</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {new Date(stream.endTime).toLocaleDateString()}
              </dd>
            </div>
            {stream.cliffTime && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Cliff Date</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(stream.cliffTime).toLocaleDateString()}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* On-chain Info */}
        {stream.streamflowStreamId && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold">On-Chain Information</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Streamflow Stream ID</dt>
                <dd className="mt-1 font-mono text-sm text-gray-900">
                  {stream.streamflowStreamId}
                </dd>
              </div>
              {stream.onchainTx && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Transaction Signature</dt>
                  <dd className="mt-1 break-all font-mono text-sm text-gray-900">
                    {stream.onchainTx}
                  </dd>
                </div>
              )}
              {stream.streamflowDetails && (
                <>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Available Amount</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {stream.streamflowDetails.availableAmount} {stream.tokenSymbol}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Withdrawn Amount</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {stream.streamflowDetails.withdrawnAmount} {stream.tokenSymbol}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-4">
          {stream.status === 'ACTIVE' &&
            stream.isRecipient &&
            stream.streamflowDetails &&
            Number(stream.streamflowDetails.availableAmount) > 0 && (
              <button
                onClick={handleWithdraw}
                disabled={actionLoading !== null || !connectedWallet?.getStreamflowAdapter}
                className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionLoading === 'withdraw' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowDownToLine className="h-4 w-4" />
                )}
                {actionLoading === 'withdraw'
                  ? 'Withdrawing...'
                  : `Withdraw ${Number(stream.streamflowDetails.availableAmount).toFixed(4)} ${stream.tokenSymbol}`}
              </button>
            )}
          {stream.status === 'ACTIVE' &&
            (canPauseStream || canCancelStream) &&
            !permissionsLoading && (
              <>
                {canPauseStream && (
                  <button
                    onClick={handlePause}
                    disabled={actionLoading !== null}
                    className="flex items-center gap-2 rounded-md border border-yellow-300 bg-white px-4 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-50 disabled:opacity-50"
                  >
                    <Pause className="h-4 w-4" />
                    {actionLoading === 'pause' ? 'Pausing...' : 'Pause Stream'}
                  </button>
                )}
                {canCancelStream && (
                  <button
                    onClick={handleCancel}
                    disabled={actionLoading !== null}
                    className="flex items-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel Stream'}
                  </button>
                )}
              </>
            )}
        </div>
      </div>
    </div>
  );
}
