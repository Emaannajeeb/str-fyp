'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  User,
  Wallet,
  TrendingUp,
  ArrowDownToLine,
  CheckCircle,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { KPIGrid } from '@/components/ui/KPIGrid';
import { CardSkeleton } from '@/components/ui/SkeletonLoader';

interface ProfileResponse {
  user: { email: string; name: string | null };
  employee: { displayName: string; status: string; startDate: string } | null;
  roles: { key: string; label: string }[];
  wallet: { address: string; provider: string; network: string } | null;
}

interface StreamSummary {
  id: string;
  status: string;
  tokenSymbol: string;
  totalAmount: string;
  accruedAmount: string;
  withdrawnAmount: string;
  startTime: string;
  endTime: string;
}

interface Transaction {
  action: string;
  streamId: string;
  amount: string | null;
  txSignature: string | null;
  createdAt: string;
}

function getAvailableToWithdraw(stream: StreamSummary): number {
  const accrued = Number(stream.accruedAmount);
  const withdrawn = Number(stream.withdrawnAmount);
  return Math.max(0, accrued - withdrawn);
}

function formatActionLabel(action: string): string {
  switch (action) {
    case 'STREAM_WITHDRAW':
      return 'Withdrawal';
    case 'STREAM_CREATED':
      return 'Stream created';
    case 'STREAM_PAUSED':
      return 'Stream paused';
    case 'STREAM_CANCELLED':
      return 'Stream cancelled';
    default:
      return action.replace(/_/g, ' ').toLowerCase();
  }
}

export default function EmployeeDashboardPage() {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [streams, setStreams] = useState<StreamSummary[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDashboard();
  }, []);

  const loadDashboard = async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const [profileRes, streamsRes, txRes, balanceRes] = await Promise.all([
        fetch('/api/me/profile'),
        fetch('/api/me/streams'),
        fetch('/api/me/transactions'),
        fetch('/api/wallets/balance'),
      ]);

      if (!profileRes.ok) {
        throw new Error('Failed to load profile');
      }

      const profileData = await profileRes.json();
      setProfile(profileData);

      if (streamsRes.ok) {
        const streamsData = await streamsRes.json();
        setStreams(streamsData.streams ?? []);
      }

      if (txRes.ok) {
        const txData = await txRes.json();
        setTransactions(txData.transactions ?? []);
      }

      if (balanceRes.ok) {
        const balanceData = await balanceRes.json();
        if (balanceData.success && typeof balanceData.balance === 'number') {
          setBalance(balanceData.balance);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const activeStreams = streams.filter((s) => s.status === 'ACTIVE').length;
  const totalAccrued = streams.reduce((sum, s) => sum + Number(s.accruedAmount), 0);
  const totalWithdrawn = streams.reduce((sum, s) => sum + Number(s.withdrawnAmount), 0);
  const availableToWithdraw = streams.reduce((sum, s) => sum + getAvailableToWithdraw(s), 0);

  if (loading) {
    return (
      <div>
        <PageHeader title="My Dashboard" description="Your payroll overview" />
        <KPIGrid>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </KPIGrid>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div>
        <PageHeader title="My Dashboard" description="Your payroll overview" />
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
          {error ?? 'Failed to load dashboard'}
        </div>
      </div>
    );
  }

  const displayName =
    profile.employee?.displayName ?? profile.user.name ?? profile.user.email.split('@')[0];

  return (
    <div className="space-y-8">
      <PageHeader
        title="My Dashboard"
        description="Your profile, payment streams, and transaction history"
      />

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white">
              <User className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{displayName}</h2>
              <p className="text-sm text-gray-600">{profile.user.email}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {profile.roles.map((role) => (
                  <span
                    key={role.key}
                    className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
                  >
                    {role.label}
                  </span>
                ))}
                {profile.employee && (
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                    {profile.employee.status}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Wallet className="h-4 w-4" />
              <span className="font-medium">Primary wallet:</span>
              <code className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs">
                {profile.wallet?.address
                  ? `${profile.wallet.address.slice(0, 8)}...${profile.wallet.address.slice(-6)}`
                  : 'Not linked'}
              </code>
            </div>
            {balance !== null && (
              <div className="flex items-center gap-2 text-gray-600">
                <TrendingUp className="h-4 w-4" />
                <span className="font-medium">SOL balance:</span>
                <span>{balance.toFixed(4)} SOL</span>
              </div>
            )}
            {!profile.wallet && (
              <Link
                href="/settings/wallets"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Connect wallet
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </div>

      <KPIGrid>
        <StatCard
          label="Active Streams"
          value={activeStreams.toString()}
          icon={CheckCircle}
          description={`${streams.length} total streams`}
        />
        <StatCard
          label="Total Accrued"
          value={totalAccrued.toFixed(4)}
          icon={TrendingUp}
          description="Across all streams"
        />
        <StatCard
          label="Total Withdrawn"
          value={totalWithdrawn.toFixed(4)}
          icon={ArrowDownToLine}
          description="Already claimed"
        />
        <StatCard
          label="Available to Withdraw"
          value={availableToWithdraw.toFixed(4)}
          icon={Wallet}
          description="Ready to claim now"
        />
      </KPIGrid>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-900">My Streams</h3>
            <Link
              href="/me/streams"
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-gray-200">
            {streams.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-gray-500">
                No payment streams yet. Streams appear here once payroll is set up for you.
              </p>
            ) : (
              streams.slice(0, 5).map((stream) => (
                <div key={stream.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{stream.tokenSymbol} stream</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(stream.startTime), 'MMM d, yyyy')} –{' '}
                        {format(new Date(stream.endTime), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        stream.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {stream.status}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-600">
                    <div>
                      <span className="block text-gray-500">Accrued</span>
                      {Number(stream.accruedAmount).toFixed(4)}
                    </div>
                    <div>
                      <span className="block text-gray-500">Withdrawn</span>
                      {Number(stream.withdrawnAmount).toFixed(4)}
                    </div>
                    <div>
                      <span className="block text-gray-500">Available</span>
                      {getAvailableToWithdraw(stream).toFixed(4)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {transactions.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-gray-500">
                No transactions yet. Withdrawals and stream events will appear here.
              </p>
            ) : (
              transactions.slice(0, 8).map((tx, index) => (
                <div key={`${tx.streamId}-${tx.createdAt}-${index}`} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">{formatActionLabel(tx.action)}</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(tx.createdAt), 'MMM d, yyyy HH:mm')}
                      </p>
                      {tx.amount && (
                        <p className="mt-1 text-sm text-gray-700">Amount: {tx.amount}</p>
                      )}
                    </div>
                    {tx.txSignature && (
                      <a
                        href={`https://explorer.solana.com/tx/${tx.txSignature}${
                          process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta'
                            ? ''
                            : '?cluster=devnet'
                        }`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex shrink-0 items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                      >
                        View
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
