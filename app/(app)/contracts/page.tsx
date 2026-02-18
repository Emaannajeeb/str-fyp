'use client';

import { useState, useEffect } from 'react';
import { Plus, FileText, ExternalLink, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';
import { useToastStore } from '@/lib/store/toast';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { PERMISSION_KEYS } from '@/types/rbac';
import { useWalletStore } from '@/lib/wallet/store';
import { Transaction } from '@solana/web3.js';

// Helper function to get Solana explorer URL (client-side compatible)
const getExplorerUrl = (txSignature: string, cluster: string = 'devnet'): string => {
  const clusterParam = cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${txSignature}${clusterParam}`;
};

interface Employee {
  id: string;
  displayName: string;
}

interface Contract {
  id: string;
  employeeId: string;
  employee?: {
    id: string;
    displayName: string;
  };
  tokenSymbol: string;
  amountPerPeriod: string;
  period: string;
  rateType: string;
  active: boolean;
  onchainTx?: string | null;
  startDate: string;
  endDate?: string | null;
}

export default function ContractsPage() {
  const router = useRouter();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signingTransaction, setSigningTransaction] = useState(false);
  const { success, error: showError } = useToastStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const { connectedWallet } = useWalletStore();
  const canCreateContract = hasPermission(PERMISSION_KEYS.CREATE_CONTRACT);

  // Form state
  const [employeeId, setEmployeeId] = useState('');
  const [tokenMint, setTokenMint] = useState('So11111111111111111111111111111111111111112'); // SOL
  const [tokenSymbol, setTokenSymbol] = useState('SOL');
  const [rateType, setRateType] = useState<'SALARY' | 'HOURLY' | 'MILESTONE'>('SALARY');
  const [amountPerPeriod, setAmountPerPeriod] = useState('');
  const [period, setPeriod] = useState<'MONTHLY' | 'WEEKLY' | 'BIWEEKLY' | 'ONE_TIME'>('MONTHLY');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Fetch contracts
      const contractsRes = await fetch('/api/contracts');
      if (contractsRes.ok) {
        const contractsData = await contractsRes.json();
        setContracts(contractsData.contracts || []);
      }

      // Fetch employees for dropdown
      const employeesRes = await fetch('/api/employees');
      if (employeesRes.ok) {
        const employeesData = await employeesRes.json();
        setEmployees(employeesData.employees || []);
      }

      setLoading(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load data');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // First, create the contract in the database
      const response = await fetch('/api/contracts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeId,
          tokenMint,
          tokenSymbol,
          rateType,
          amountPerPeriod,
          period,
          startDate: new Date(startDate).toISOString(),
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
          notes: notes || undefined,
          walletAddress: connectedWallet?.address, // Send connected wallet address
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create contract');
      }

      // If transaction data is returned, sign it with Phantom
      if (data.transactionData && connectedWallet) {
        setSigningTransaction(true);
        try {
          // Deserialize transaction (browser-compatible base64 decode)
          const base64String = data.transactionData.transaction;
          const binaryString = atob(base64String);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const transaction = Transaction.from(bytes);

          // Sign and send transaction via Phantom
          const txSignature = await connectedWallet.signAndSendTransaction(transaction);

          // Update contract with transaction signature
          const updateResponse = await fetch(`/api/contracts/${data.contract.id}/onchain`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              onchainTx: txSignature,
            }),
          });

          if (!updateResponse.ok) {
            console.warn('Failed to update contract with transaction signature');
          }

          // Get cluster from env
          const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet';
          const explorerUrl = getExplorerUrl(txSignature, cluster);

          success(
            `Contract created and recorded on-chain! View on Explorer: ${explorerUrl}`,
            8000
          );

          // Open explorer in new tab
          window.open(explorerUrl, '_blank');
        } catch (txError) {
          console.error('Transaction signing error:', txError);
          showError(
            `Contract created but transaction failed: ${txError instanceof Error ? txError.message : 'Unknown error'}`
          );
        } finally {
          setSigningTransaction(false);
        }
      } else {
        success('Contract created successfully');
      }

      // Reset form
      setEmployeeId('');
      setAmountPerPeriod('');
      setStartDate('');
      setEndDate('');
      setNotes('');
      setShowForm(false);
      await loadData();
      router.refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create contract');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Contracts"
        description="Manage employee payment contracts"
        action={
          canCreateContract && !permissionsLoading ? (
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Create Contract
            </button>
          ) : null
        }
      />

      {showForm && canCreateContract && (
        <form
          onSubmit={handleSubmit}
          className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-semibold">Create Contract</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="employeeId" className="block text-sm font-medium text-gray-700">
                Employee
              </label>
              <select
                id="employeeId"
                required
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
              >
                <option value="">-- Select Employee --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="tokenMint" className="block text-sm font-medium text-gray-700">
                  Token Mint
                </label>
                <input
                  id="tokenMint"
                  type="text"
                  required
                  value={tokenMint}
                  onChange={(e) => setTokenMint(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                />
              </div>

              <div>
                <label htmlFor="tokenSymbol" className="block text-sm font-medium text-gray-700">
                  Token Symbol
                </label>
                <input
                  id="tokenSymbol"
                  type="text"
                  required
                  value={tokenSymbol}
                  onChange={(e) => setTokenSymbol(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="rateType" className="block text-sm font-medium text-gray-700">
                  Rate Type
                </label>
                <select
                  id="rateType"
                  value={rateType}
                  onChange={(e) => setRateType(e.target.value as any)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                >
                  <option value="SALARY">Salary</option>
                  <option value="HOURLY">Hourly</option>
                  <option value="MILESTONE">Milestone</option>
                </select>
              </div>

              <div>
                <label htmlFor="period" className="block text-sm font-medium text-gray-700">
                  Period
                </label>
                <select
                  id="period"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as any)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="BIWEEKLY">Biweekly</option>
                  <option value="ONE_TIME">One Time</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="amountPerPeriod" className="block text-sm font-medium text-gray-700">
                Amount Per Period
              </label>
              <input
                id="amountPerPeriod"
                type="number"
                step="0.00000001"
                required
                value={amountPerPeriod}
                onChange={(e) => setAmountPerPeriod(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                placeholder="1000"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
                  Start Date
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
                  End Date (Optional)
                </label>
                <input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                Notes (Optional)
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
              />
            </div>

            {!connectedWallet && (
              <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> Connect your Phantom wallet to record this contract on-chain and make it visible on Solana Explorer.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting || signingTransaction}
                className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {signingTransaction ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing Transaction...
                  </>
                ) : submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Contract'
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                }}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {loading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : contracts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No contracts yet"
          description="Create your first contract to set up payment terms for employees."
          action={
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Create Your First Contract
            </button>
          }
        />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Employee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Token
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount/Period
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Period
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  On-Chain
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {contracts.map((contract) => (
                <tr key={contract.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {contract.employee?.displayName || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {contract.tokenSymbol}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {parseFloat(contract.amountPerPeriod).toLocaleString()} {contract.tokenSymbol}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {contract.period}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        contract.active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {contract.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {contract.onchainTx ? (
                      <a
                        href={getExplorerUrl(contract.onchainTx)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                      >
                        View on Explorer
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-gray-400">Not on-chain</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
