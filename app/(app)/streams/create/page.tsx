'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Wallet } from 'lucide-react';
import { useWalletStore } from '@/lib/wallet/store';
import { useToastStore } from '@/lib/store/toast';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { PERMISSION_KEYS } from '@/types/rbac';
import { createStreamInBrowser } from '@/lib/streamflow/browser-client';

interface EligibleContract {
  id: string;
  employeeId: string;
  employee: {
    id: string;
    displayName: string;
    recipientWallet?: string | null;
  } | null;
  tokenMint: string;
  tokenSymbol: string;
  amountPerPeriod: string;
  period: string;
  startDate: string;
  endDate: string | null;
}

const PERIOD_SECONDS: Record<string, number> = {
  MONTHLY: 30 * 24 * 60 * 60,
  WEEKLY: 7 * 24 * 60 * 60,
  BIWEEKLY: 14 * 24 * 60 * 60,
  ONE_TIME: 0,
};

function computeTotalAmount(
  amountPerPeriod: string,
  period: string,
  startTime: number,
  endTime: number
): string {
  const duration = endTime - startTime;
  const periodSec = PERIOD_SECONDS[period] || duration;
  if (periodSec <= 0) return amountPerPeriod;
  const periods = Math.ceil(duration / periodSec);
  return (Number(amountPerPeriod) * periods).toFixed(8);
}

export default function CreateStreamPage() {
  const router = useRouter();
  const [contracts, setContracts] = useState<EligibleContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [contractId, setContractId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [cliffDate, setCliffDate] = useState('');
  const { connectedWallet } = useWalletStore();
  const { success, error: showError } = useToastStore();
  const { hasPermission, loading: permLoading } = usePermissions();
  const canCreate = hasPermission(PERMISSION_KEYS.CREATE_STREAM);

  useEffect(() => {
    loadEligibleContracts();
  }, []);

  const loadEligibleContracts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/contracts?eligibleForStream=true');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load contracts');
      setContracts(data.contracts || []);
      if (data.contracts?.length && !contractId) {
        setContractId(data.contracts[0].id);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load contracts');
    } finally {
      setLoading(false);
    }
  };

  const selectedContract = contracts.find((c) => c.id === contractId);

  const handleCreateWithPhantom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContract || !startDate || !endDate) {
      showError('Select a contract and set start/end dates.');
      return;
    }
    const recipientWallet = selectedContract.employee?.recipientWallet;
    if (!recipientWallet) {
      showError('Employee must have a linked primary wallet. Link it in Settings > Wallets.');
      return;
    }
    if (!connectedWallet?.getStreamflowAdapter) {
      showError('Connect your Phantom wallet in Settings > Wallets first.');
      return;
    }

    // Streamflow rejects past/invalid timestamps (Custom error 112). Date inputs
    // resolve to midnight, so the chosen start can be in the past; bump it into
    // the near future and keep end > start and cliff within [start, end].
    const nowSec = Math.floor(Date.now() / 1000);
    const START_BUFFER_SEC = 120;
    const rawStart = Math.floor(new Date(startDate).getTime() / 1000);
    const startTime = Math.max(rawStart, nowSec + START_BUFFER_SEC);

    const rawEnd = Math.floor(new Date(endDate).getTime() / 1000);
    if (rawEnd <= startTime) {
      showError('End date must be after the start date (and in the future).');
      return;
    }
    const endTime = rawEnd;

    const rawCliff = cliffDate ? Math.floor(new Date(cliffDate).getTime() / 1000) : startTime;
    const cliffTime = Math.min(Math.max(rawCliff, startTime), endTime);
    const periodSec = PERIOD_SECONDS[selectedContract.period] || endTime - startTime;
    const totalAmount = computeTotalAmount(
      selectedContract.amountPerPeriod,
      selectedContract.period,
      startTime,
      endTime
    );

    setSubmitting(true);
    try {
      const adapter = connectedWallet.getStreamflowAdapter();
      const result = await createStreamInBrowser(
        {
          recipient: recipientWallet,
          tokenMint: selectedContract.tokenMint,
          totalAmount,
          amountPerPeriod: selectedContract.amountPerPeriod,
          startTime,
          endTime,
          period: periodSec,
          cliffTime,
          decimals: 9,
          name: `Payroll: ${selectedContract.employee?.displayName ?? 'Stream'}`,
          isNative: selectedContract.tokenMint === 'So11111111111111111111111111111111111111112',
        },
        adapter
      );

      const postRes = await fetch('/api/streams/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId: selectedContract.id,
          employeeId: selectedContract.employeeId,
          startTime,
          endTime,
          cliffTime: cliffDate ? cliffTime : undefined,
          streamflowStreamId: result.streamId,
          onchainTx: result.txId,
          senderWalletAddress: connectedWallet.address,
        }),
      });

      const postData = await postRes.json();
      if (!postRes.ok) {
        throw new Error(postData.error || 'Failed to save stream');
      }

      success('Stream created successfully.');
      router.push(postData.stream?.id ? `/streams/${postData.stream.id}` : '/streams');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create stream');
    } finally {
      setSubmitting(false);
    }
  };

  if (!canCreate && !permLoading) {
    return (
      <div className="rounded-md bg-amber-50 p-4">
        <p className="text-sm text-amber-800">You do not have permission to create streams.</p>
        <Link
          href="/streams"
          className="mt-2 inline-block text-sm font-medium text-amber-700 hover:text-amber-900"
        >
          Back to Streams
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link
          href="/streams"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Streams
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900">Create Stream</h1>
      <p className="mt-1 text-sm text-gray-600">
        Choose an approved contract and create a payment stream on-chain with your Phantom wallet.
      </p>

      {loading ? (
        <div className="mt-8 flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : contracts.length === 0 ? (
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-8 text-center">
          <Wallet className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-gray-600">No contracts eligible for stream creation.</p>
          <p className="mt-2 text-sm text-gray-500">
            A contract needs contract approval and funding (STREAM) approval, and must not already
            have a stream.
          </p>
          <Link
            href="/contracts"
            className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Go to Contracts
          </Link>
        </div>
      ) : (
        <form
          onSubmit={handleCreateWithPhantom}
          className="mt-8 space-y-6 rounded-lg border border-gray-200 bg-white p-6"
        >
          <div>
            <label htmlFor="contractId" className="block text-sm font-medium text-gray-700">
              Contract
            </label>
            <select
              id="contractId"
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
            >
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.employee?.displayName ?? 'Unknown'} – {c.tokenSymbol} {c.amountPerPeriod}/
                  {c.period}
                </option>
              ))}
            </select>
            {selectedContract && !selectedContract.employee?.recipientWallet && (
              <p className="mt-2 text-sm text-amber-700">
                This employee has no linked wallet. They must link a primary wallet before you can
                create a stream.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
                Start date
              </label>
              <input
                id="startDate"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
                End date
              </label>
              <input
                id="endDate"
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="cliffDate" className="block text-sm font-medium text-gray-700">
              Cliff date (optional)
            </label>
            <input
              id="cliffDate"
              type="date"
              value={cliffDate}
              onChange={(e) => setCliffDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
            />
          </div>

          {!connectedWallet?.getStreamflowAdapter && (
            <div className="rounded-md bg-amber-50 p-4">
              <p className="text-sm text-amber-800">
                Connect your Phantom wallet in Settings → Wallets to create the stream on-chain.
              </p>
            </div>
          )}

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={
                submitting ||
                !selectedContract?.employee?.recipientWallet ||
                !connectedWallet?.getStreamflowAdapter ||
                !startDate ||
                !endDate
              }
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Wallet className="h-4 w-4" />
                  Create with Phantom
                </>
              )}
            </button>
            <Link
              href="/streams"
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
