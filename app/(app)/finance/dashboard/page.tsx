'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Pause, Calendar, DollarSign, TrendingUp, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { KPIGrid } from '@/components/ui/KPIGrid';
import { CardSkeleton } from '@/components/ui/SkeletonLoader';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useWalletStore } from '@/lib/wallet/store';

interface DashboardMetrics {
  activeStreams: number;
  monthlyPayout: string;
  pausedStreams: number;
  upcomingStarts: number;
  burnRate: string;
  capAmount: string;
}

interface BurnRateData {
  date: string;
  amount: number;
}

export default function FinanceDashboardPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [burnRateData, setBurnRateData] = useState<BurnRateData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const { connectedWallet } = useWalletStore();

  useEffect(() => {
    loadDashboardData();
  }, [connectedWallet]);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/finance/dashboard');

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: 'Failed to fetch dashboard data' }));
        if (response.status === 403) {
          setRedirecting(true);
          router.replace('/me');
          return;
        }
        const message =
          (typeof errorData.error === 'string' && errorData.error) ||
          (typeof errorData.message === 'string' && errorData.message) ||
          'Failed to fetch dashboard data';
        throw new Error(message);
      }

      const data = await response.json();

      if (data.success) {
        setMetrics(data.metrics);
        setBurnRateData(data.burnRateData || []);
      } else {
        throw new Error(data.error || 'Failed to load dashboard metrics');
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');

      // Set empty metrics on error
      setMetrics({
        activeStreams: 0,
        monthlyPayout: '0',
        pausedStreams: 0,
        upcomingStarts: 0,
        burnRate: '0',
        capAmount: '0',
      });
      setBurnRateData([]);
    } finally {
      setLoading(false);
    }
  };

  if (redirecting) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <PageHeader title="Finance Dashboard" description="Redirecting to your dashboard..." />
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-600 shadow-sm">
          Redirecting to your dashboard...
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <PageHeader
          title="Finance Dashboard"
          description="Overview of payroll streams and budgets"
        />
        <KPIGrid>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </KPIGrid>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="h-64 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <PageHeader
          title="Finance Dashboard"
          description="Overview of payroll streams and budgets"
        />
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <AlertCircle className="h-5 w-5" />
            <p>No data available</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <PageHeader
          title="Finance Dashboard"
          description="Overview of payroll streams and budgets"
        />
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-red-800">
            <AlertCircle className="h-5 w-5" />
            <div>
              <p className="font-medium">Error loading dashboard</p>
              <p className="mt-1 text-sm text-red-600">{error}</p>
              <button
                onClick={loadDashboardData}
                className="mt-3 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const burnPercentage = (
    (parseFloat(metrics.burnRate) / parseFloat(metrics.capAmount)) *
    100
  ).toFixed(1);
  const burnTrend =
    parseFloat(burnPercentage) > 80 ? { value: 'High usage', isPositive: false } : undefined;

  return (
    <div>
      <PageHeader
        title="Finance Dashboard"
        description={
          connectedWallet
            ? `Overview of payroll streams and budgets - Connected: ${connectedWallet.address.slice(0, 8)}...${connectedWallet.address.slice(-8)}`
            : 'Overview of payroll streams and budgets'
        }
      />

      {/* KPI Cards */}
      <KPIGrid columns={5}>
        <StatCard
          label="Active Streams"
          value={metrics.activeStreams}
          icon={Play}
          iconColor="green"
        />
        <StatCard
          label="Monthly Payout"
          value={`${parseFloat(metrics.monthlyPayout).toLocaleString()} SOL`}
          icon={DollarSign}
          iconColor="blue"
        />
        <StatCard label="Paused" value={metrics.pausedStreams} icon={Pause} iconColor="yellow" />
        <StatCard
          label="Upcoming Starts"
          value={metrics.upcomingStarts}
          icon={Calendar}
          iconColor="purple"
        />
        <StatCard
          label="Burn vs Cap"
          value={`${burnPercentage}%`}
          icon={TrendingUp}
          iconColor="orange"
          trend={burnTrend}
          description={`${parseFloat(metrics.burnRate).toLocaleString()} / ${parseFloat(metrics.capAmount).toLocaleString()} SOL`}
        />
      </KPIGrid>

      {/* Burn Rate Chart */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Burn Rate Over Time</h2>
          <p className="mt-1 text-sm text-gray-600">Daily spending over the last 30 days</p>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={burnRateData}>
              <defs>
                <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
              <XAxis
                dataKey="date"
                className="text-xs"
                tick={{ fill: '#6b7280' }}
                tickLine={{ stroke: '#e5e7eb' }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: '#6b7280' }}
                tickLine={{ stroke: '#e5e7eb' }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}
                formatter={(value: number) => [`${value.toFixed(2)} SOL`, 'Amount']}
                labelStyle={{ fontWeight: 600, color: '#111827' }}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#colorAmount)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
