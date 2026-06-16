'use client';

import { useState, useEffect } from 'react';
import { Plus, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';
import { useToastStore } from '@/lib/store/toast';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { PERMISSION_KEYS } from '@/types/rbac';

interface Employee {
  id: string;
  displayName: string;
  status: string;
  startDate: string;
  endDate: string | null;
  userId: string | null;
  email: string | null;
  walletAddress: string | null;
}

function accountStatus(employee: Employee): string {
  if (!employee.userId) return 'Not linked';
  if (employee.walletAddress) return 'Linked + wallet';
  return 'Linked, no wallet';
}

export default function EmployeesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { success, error: showError } = useToastStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const canManageEmployees = hasPermission(PERMISSION_KEYS.MANAGE_EMPLOYEES);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [startDate, setStartDate] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | 'TERMINATED' | 'ON_LEAVE'>('ACTIVE');

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/employees');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load employees');
      }

      setEmployees(data.employees || []);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch('/api/employees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName,
          email,
          walletAddress: walletAddress.trim() || undefined,
          startDate: new Date(startDate).toISOString(),
          status,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create employee');
      }

      setDisplayName('');
      setEmail('');
      setWalletAddress('');
      setStartDate('');
      setStatus('ACTIVE');
      setShowForm(false);
      await loadEmployees();
      router.refresh();
      success('Employee created successfully');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create employee');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Manage your organization's employees"
        action={
          canManageEmployees && !permissionsLoading ? (
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Employee
            </button>
          ) : null
        }
      />

      {showForm && canManageEmployees && (
        <form
          onSubmit={handleSubmit}
          className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-semibold">Create Employee</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                placeholder="john@example.com"
              />
              <p className="mt-1 text-xs text-gray-500">
                Employee signs in with this email (or Google using the same address).
              </p>
            </div>

            <div>
              <label htmlFor="walletAddress" className="block text-sm font-medium text-gray-700">
                Wallet Address (optional)
              </label>
              <input
                id="walletAddress"
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                placeholder="Solana wallet address for payroll"
              />
              <p className="mt-1 text-xs text-gray-500">
                If omitted, the employee can connect a wallet after signing in.
              </p>
            </div>

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
              <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                id="status"
                value={status}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'ACTIVE' || v === 'INACTIVE' || v === 'TERMINATED' || v === 'ON_LEAVE')
                    setStatus(v);
                }}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="TERMINATED">Terminated</option>
                <option value="ON_LEAVE">On Leave</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Create Employee'}
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
        <TableSkeleton rows={5} columns={5} />
      ) : employees.length === 0 ? (
        <EmptyState
          icon={User}
          title="No employees yet"
          description="Create your first employee to get started with payroll management."
          action={
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Your First Employee
            </button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Start Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Account
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    {employee.displayName}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                    {employee.email ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        employee.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {employee.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                    {new Date(employee.startDate).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                    {accountStatus(employee)}
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
