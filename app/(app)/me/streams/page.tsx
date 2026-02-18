'use client';

import { useState, useEffect } from 'react';
import { Wallet, Clock, TrendingUp, Info, ExternalLink, CheckCircle } from 'lucide-react';
import { format, differenceInDays, isAfter, isBefore } from 'date-fns';

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
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

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
    // Solana Explorer URL - adjust cluster as needed
    return `https://explorer.solana.com/tx/${tx}?cluster=devnet`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading your streams...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">My Payment Streams</h1>
        <p className="mt-2 text-gray-600">
          View your active payment streams and track accruals in real-time.
        </p>
      </div>

      {/* How It Works Panel */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
        <button
          onClick={() => setShowHowItWorks(!showHowItWorks)}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-3">
            <Info className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-blue-900">How It Works</h2>
          </div>
          <span className="text-blue-600 text-sm font-medium">
            {showHowItWorks ? 'Hide' : 'Show'} Details
          </span>
        </button>

        {showHowItWorks && (
          <div className="mt-4 space-y-4 text-sm text-blue-800">
            <div>
              <h3 className="font-semibold mb-2">Continuous Accrual</h3>
              <p>
                Your payment stream continuously accrues tokens over time. The amount you see as
                "Accrued to Date" represents the tokens that have been earned up to this moment.
                This amount increases automatically as time passes, without any action required
                from you.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Cliff Periods</h3>
              <p>
                Some streams have a "cliff period" - a waiting period before accrual begins. During
                this time, no tokens accrue. Once the cliff period ends, normal accrual begins.
                The "Next Cliff" date shows when your next cliff period ends (if applicable).
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">On-Chain Transparency</h3>
              <p>
                All payment streams are executed on the Solana blockchain, providing complete
                transparency and auditability. You can verify your stream on-chain using the
                transaction IDs and Streamflow stream IDs shown below. Every accrual and withdrawal
                is recorded immutably on the blockchain.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Withdrawals</h3>
              <p>
                You can withdraw your accrued tokens at any time. Withdrawals are processed
                on-chain through your connected wallet. The "Withdrawn Amount" shows how much you
                have already withdrawn from this stream.
              </p>
            </div>

            <div className="bg-blue-100 rounded p-3 mt-4">
              <p className="font-semibold mb-1">💡 Pro Tip:</p>
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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <Wallet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-2">No payment streams found.</p>
          <p className="text-sm text-gray-500">
            Streams will appear here once they are created and activated.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {streams.map((stream) => {
            const progress = calculateProgress(stream);
            const daysRemaining = Math.max(0, differenceInDays(new Date(stream.endTime), new Date()));
            const isCliffPending = stream.cliffTime && isBefore(new Date(), new Date(stream.cliffTime));

            return (
              <div
                key={stream.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">Total Amount</span>
                    </div>
                    <p className="text-xl font-semibold text-gray-900">
                      {stream.tokenSymbol} {Number(stream.totalAmount).toLocaleString()}
                    </p>
                  </div>

                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-gray-700">Accrued to Date</span>
                    </div>
                    <p className="text-xl font-semibold text-green-700">
                      {stream.tokenSymbol} {Number(stream.accruedAmount).toLocaleString(undefined, { maximumFractionDigits: 8 })}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {progress}% of total
                    </p>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Wallet className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-gray-700">Withdrawn</span>
                    </div>
                    <p className="text-xl font-semibold text-blue-700">
                      {stream.tokenSymbol} {Number(stream.withdrawnAmount).toLocaleString(undefined, { maximumFractionDigits: 8 })}
                    </p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div>
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                    <span>Stream Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Timeline */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">Start Date</span>
                    </div>
                    <p className="text-sm text-gray-900">{formatDate(stream.startTime)}</p>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">End Date</span>
                    </div>
                    <p className="text-sm text-gray-900">{formatDate(stream.endTime)}</p>
                    {daysRemaining > 0 && (
                      <p className="text-xs text-gray-500 mt-1">{daysRemaining} days remaining</p>
                    )}
                  </div>

                  {stream.nextCliff && (
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm font-medium text-gray-700">Next Cliff</span>
                      </div>
                      <p className="text-sm text-gray-900">{formatDate(stream.nextCliff)}</p>
                      {isCliffPending && (
                        <p className="text-xs text-yellow-600 mt-1">Cliff period active</p>
                      )}
                    </div>
                  )}
                </div>

                {/* On-Chain IDs */}
                <div className="pt-4 border-t border-gray-200 space-y-2">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">On-Chain Information</h4>
                  <div className="space-y-2">
                    {stream.streamflowStreamId && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Streamflow Stream ID:</span>
                        <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
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
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-mono"
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

                {/* Withdrawal Note */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> Withdrawals are currently view-only. To initiate a
                    withdrawal, use your connected wallet provider to interact with the stream
                    on-chain.
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

