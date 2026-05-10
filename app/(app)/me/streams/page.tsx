'use client';

import { useState, useEffect } from 'react';
import {
  Wallet,
  Clock,
  TrendingUp,
  Info,
  ExternalLink,
  CheckCircle,
  Loader2,
  ArrowDownToLine,
} from 'lucide-react';
import { format, differenceInDays, isBefore } from 'date-fns';
import { useWalletStore } from '@/lib/wallet/store';
import { useToastStore } from '@/lib/store/toast';
import { withdrawStreamInBrowser } from '@/lib/streamflow/browser-client';

interface Stream {
  id: string;
  streamflowStreamId: string | null;
  onchainTx: string | null;
  status: string;
  tokenSymbol: string;
  tokenMint: string;
  totalAmount: string;
  accruedAmount: string;
  withdrawnAmount: string;
  startTime: string;
  endTime: string;
  cliffTime: string | null;
  nextCliff: string | null;
  contract: {
    id: string;
    tokenSymbol: string;
    amountPerPeriod: string;
    period: string;
    rateType: string;
  };
  lastSyncedAt: string | null;
}

interface Employee {
  id: string;
  displayName: string;
}

export default function MyStreamsPage() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [_employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [withdrawingStreamId, setWithdrawingStreamId] = useState<string | null>(null);
  const { connectedWallet } = useWalletStore();
  const { success, error: showError } = useToastStore();

  useEffect(() => {
    loadStreams();
  }, []);

  const loadStreams = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/me/streams');
      if (!response.ok) {
        throw new Error('Failed to load streams');
      }
      const data = await response.json();
      setStreams(data.streams);
      setEmployee(data.employee);
    } catch (error) {
      console.error('Error loading streams:', error);
    } finally {
      setIsLoading(false);
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

  const calculateProgress = (stream: Stream): number => {
    const now = new Date();
    const start = new Date(stream.startTime);
    const end = new Date(stream.endTime);

    if (now < start) return 0;
    if (now > end) return 100;

    const total = end.getTime() - start.getTime();
    const elapsed = now.getTime() - start.getTime();
    return Math.round((elapsed / total) * 100);
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'N/A';
    return format(new Date(dateString), 'MMM d, yyyy');
  };

  const formatDateTime = (dateString: string | null): string => {
    if (!dateString) return 'N/A';
    return format(new Date(dateString), 'MMM d, yyyy HH:mm');
  };

  const getExplorerUrl = (tx: string | null): string | null => {
    if (!tx) return null;
    const cluster =
      process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta' ? '' : '?cluster=devnet';
    return `https://explorer.solana.com/tx/${tx}${cluster}`;
  };

  const getAvailableToWithdraw = (stream: Stream): number => {
    const accrued = Number(stream.accruedAmount);
    const withdrawn = Number(stream.withdrawnAmount);
    return Math.max(0, accrued - withdrawn);
  };

  const handleWithdraw = async (stream: Stream) => {
    if (!stream.streamflowStreamId) {
      showError('This stream has no on-chain ID yet.');
      return;
    }
    const available = getAvailableToWithdraw(stream);
    if (available <= 0) {
      showError('No amount available to withdraw.');
      return;
    }
    if (!connectedWallet?.getStreamflowAdapter) {
      showError('Connect your Phantom wallet in Settings > Wallets to withdraw.');
      return;
    }
    setWithdrawingStreamId(stream.id);
    try {
      const adapter = connectedWallet.getStreamflowAdapter();
      const amount = available.toFixed(8);
      const txId = await withdrawStreamInBrowser(stream.streamflowStreamId!, amount, adapter, 9);
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
      await loadStreams();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setWithdrawingStreamId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-600">Loading your streams...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">My Payment Streams</h1>
        <p className="mt-2 text-gray-600">
          View your active payment streams and track accruals in real-time.
        </p>
      </div>

      {/* How It Works Panel */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
        <button
          onClick={() => setShowHowItWorks(!showHowItWorks)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <Info className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-blue-900">How It Works</h2>
          </div>
          <span className="text-sm font-medium text-blue-600">
            {showHowItWorks ? 'Hide' : 'Show'} Details
          </span>
        </button>

        {showHowItWorks && (
          <div className="mt-4 space-y-4 text-sm text-blue-800">
            <div>
              <h3 className="mb-2 font-semibold">Continuous Accrual</h3>
              <p>
                Your payment stream continuously accrues tokens over time. The amount you see as
                &quot;Accrued to Date&quot; represents the tokens that have been earned up to this
                moment. This amount increases automatically as time passes, without any action
                required from you.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold">Cliff Periods</h3>
              <p>
                Some streams have a &quot;cliff period&quot; — a waiting period before accrual
                begins. During this time, no tokens accrue. Once the cliff period ends, normal
                accrual begins. The &quot;Next Cliff&quot; date shows when your next cliff period
                ends (if applicable).
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold">On-Chain Transparency</h3>
              <p>
                All payment streams are executed on the Solana blockchain, providing complete
                transparency and auditability. You can verify your stream on-chain using the
                transaction IDs and Streamflow stream IDs shown below. Every accrual and withdrawal
                is recorded immutably on the blockchain.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold">Withdrawals</h3>
              <p>
                You can withdraw your accrued tokens at any time. Withdrawals are processed on-chain
                through your connected wallet. The &quot;Withdrawn Amount&quot; shows how much you
                have already withdrawn from this stream.
              </p>
            </div>

            <div className="mt-4 rounded bg-blue-100 p-3">
              <p className="mb-1 font-semibold">💡 Pro Tip:</p>
              <p>
                Your stream status updates automatically. If a stream is paused or cancelled, you
                will be notified. All changes are logged in the audit trail for complete
                transparency.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Streams List */}
      {streams.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
          <Wallet className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <p className="mb-2 text-gray-600">No payment streams found.</p>
          <p className="text-sm text-gray-500">
            Streams will appear here once they are created and activated.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {streams.map((stream) => {
            const progress = calculateProgress(stream);
            const daysRemaining = Math.max(
              0,
              differenceInDays(new Date(stream.endTime), new Date())
            );
            const isCliffPending =
              stream.cliffTime && isBefore(new Date(), new Date(stream.cliffTime));

            return (
              <div
                key={stream.id}
                className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-3">
                      <Wallet className="h-5 w-5 text-gray-400" />
                      <h3 className="text-lg font-semibold text-gray-900">
                        {stream.contract.tokenSymbol} Payment Stream
                      </h3>
                      {getStatusBadge(stream.status)}
                    </div>
                    <p className="text-sm text-gray-600">
                      {stream.contract.rateType} • {stream.contract.period}
                    </p>
                  </div>
                </div>

                {/* Amounts */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-lg bg-gray-50 p-4">
                    <div className="mb-1 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">Total Amount</span>
                    </div>
                    <p className="text-xl font-semibold text-gray-900">
                      {stream.tokenSymbol} {Number(stream.totalAmount).toLocaleString()}
                    </p>
                  </div>

                  <div className="rounded-lg bg-green-50 p-4">
                    <div className="mb-1 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-gray-700">Accrued to Date</span>
                    </div>
                    <p className="text-xl font-semibold text-green-700">
                      {stream.tokenSymbol}{' '}
                      {Number(stream.accruedAmount).toLocaleString(undefined, {
                        maximumFractionDigits: 8,
                      })}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">{progress}% of total</p>
                  </div>

                  <div className="rounded-lg bg-blue-50 p-4">
                    <div className="mb-1 flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-gray-700">Withdrawn</span>
                    </div>
                    <p className="text-xl font-semibold text-blue-700">
                      {stream.tokenSymbol}{' '}
                      {Number(stream.withdrawnAmount).toLocaleString(undefined, {
                        maximumFractionDigits: 8,
                      })}
                    </p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm text-gray-600">
                    <span>Stream Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-200">
                    <div
                      className="h-2 rounded-full bg-green-600 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Timeline */}
                <div className="grid grid-cols-1 gap-4 border-t border-gray-200 pt-4 md:grid-cols-3">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">Start Date</span>
                    </div>
                    <p className="text-sm text-gray-900">{formatDate(stream.startTime)}</p>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">End Date</span>
                    </div>
                    <p className="text-sm text-gray-900">{formatDate(stream.endTime)}</p>
                    {daysRemaining > 0 && (
                      <p className="mt-1 text-xs text-gray-500">{daysRemaining} days remaining</p>
                    )}
                  </div>

                  {stream.nextCliff && (
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <Clock className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm font-medium text-gray-700">Next Cliff</span>
                      </div>
                      <p className="text-sm text-gray-900">{formatDate(stream.nextCliff)}</p>
                      {isCliffPending && (
                        <p className="mt-1 text-xs text-yellow-600">Cliff period active</p>
                      )}
                    </div>
                  )}
                </div>

                {/* On-Chain IDs */}
                <div className="space-y-2 border-t border-gray-200 pt-4">
                  <h4 className="mb-2 text-sm font-semibold text-gray-900">On-Chain Information</h4>
                  <div className="space-y-2">
                    {stream.streamflowStreamId && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Streamflow Stream ID:</span>
                        <code className="rounded bg-gray-100 px-2 py-1 font-mono text-xs">
                          {stream.streamflowStreamId.substring(0, 16)}...
                        </code>
                      </div>
                    )}
                    {stream.onchainTx && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Transaction ID:</span>
                        <a
                          href={getExplorerUrl(stream.onchainTx) || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 font-mono text-xs text-blue-600 hover:text-blue-700"
                        >
                          {stream.onchainTx.substring(0, 16)}...
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    {stream.lastSyncedAt && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Last Synced:</span>
                        <span className="text-gray-900">{formatDateTime(stream.lastSyncedAt)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Withdraw */}
                {(() => {
                  const available = getAvailableToWithdraw(stream);
                  const canWithdraw =
                    stream.streamflowStreamId && available > 0 && stream.status === 'ACTIVE';
                  return (
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      {canWithdraw && (
                        <button
                          type="button"
                          onClick={() => handleWithdraw(stream)}
                          disabled={!!withdrawingStreamId || !connectedWallet?.getStreamflowAdapter}
                          className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {withdrawingStreamId === stream.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Withdrawing...
                            </>
                          ) : (
                            <>
                              <ArrowDownToLine className="h-4 w-4" />
                              Withdraw {available.toFixed(4)} {stream.tokenSymbol}
                            </>
                          )}
                        </button>
                      )}
                      {!connectedWallet?.getStreamflowAdapter && canWithdraw && (
                        <p className="text-sm text-amber-700">
                          Connect Phantom in Settings → Wallets to withdraw.
                        </p>
                      )}
                      {!canWithdraw && available <= 0 && stream.streamflowStreamId && (
                        <p className="text-sm text-gray-500">
                          No amount available to withdraw yet.
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
