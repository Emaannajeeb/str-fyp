'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Building2, X, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';
import { useToastStore } from '@/lib/store/toast';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { PERMISSION_KEYS } from '@/types/rbac';

interface Budget {
  id: string;
  name: string;
  tokenMint: string;
  tokenSymbol: string;
  capAmount: string;
  currentCommitted: string;
  departments: Array<{ id: string; name: string }>;
}

interface Department {
  id: string;
  name: string;
}

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [assigningBudget, setAssigningBudget] = useState<string | null>(null);
  const { success, error: showError } = useToastStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();

  // Check if user can manage budgets
  const canManageBudget = hasPermission(PERMISSION_KEYS.MANAGE_BUDGET);

  // Form state
  const [name, setName] = useState('');
  const [tokenMint, setTokenMint] = useState('So11111111111111111111111111111111111111112');
  const [tokenSymbol, setTokenSymbol] = useState('SOL');
  const [capAmount, setCapAmount] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [budgetsRes, departmentsRes] = await Promise.all([
        fetch('/api/budgets'),
        fetch('/api/departments'),
      ]);

      if (budgetsRes.ok) {
        const budgetsData = await budgetsRes.json();
        setBudgets(budgetsData.budgets || []);
      }

      if (departmentsRes.ok) {
        const departmentsData = await departmentsRes.json();
        setDepartments(departmentsData.departments || []);
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
      const response = await fetch('/api/budgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          tokenMint,
          tokenSymbol,
          capAmount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create budget');
      }

      // Reset form
      setName('');
      setCapAmount('');
      setShowForm(false);
      await loadData();
      success('Budget created successfully');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create budget');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (budgetId: string) => {
    if (!confirm('Are you sure you want to delete this budget?')) return;

    try {
      const response = await fetch(`/api/budgets/${budgetId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete budget');
      }

      await loadData();
      success('Budget deleted successfully');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete budget');
    }
  };

  const handleAssignDepartment = async (budgetId: string, departmentId: string) => {
    setAssigningBudget(budgetId);
    try {
      const response = await fetch(`/api/budgets/${budgetId}/departments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ departmentId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to assign budget');
      }

      await loadData();
      success('Budget assigned to department successfully');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to assign budget');
    } finally {
      setAssigningBudget(null);
    }
  };

  const handleUnassignDepartment = async (budgetId: string, departmentId: string) => {
    try {
      const response = await fetch(`/api/budgets/${budgetId}/departments`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ departmentId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to unassign budget');
      }

      await loadData();
      success('Budget unassigned from department successfully');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to unassign budget');
    }
  };

  return (
    <div>
      <PageHeader
        title="Budgets"
        description="Manage department budgets and spending caps"
        action={
          canManageBudget && !permissionsLoading ? (
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Create Budget
            </button>
          ) : null
        }
      />

      {showForm && canManageBudget && (
        <form
          onSubmit={handleSubmit}
          className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-semibold">Create Budget</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Budget Name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                placeholder="Q1 2024 Payroll Budget"
              />
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

            <div>
              <label htmlFor="capAmount" className="block text-sm font-medium text-gray-700">
                Cap Amount
              </label>
              <input
                id="capAmount"
                type="number"
                step="0.00000001"
                required
                value={capAmount}
                onChange={(e) => setCapAmount(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                placeholder="100000"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Create Budget'}
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
        <TableSkeleton rows={3} columns={4} />
      ) : budgets.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No budgets yet"
          description={
            canManageBudget
              ? 'Create your first budget to set spending caps for departments and tokens.'
              : 'No budgets have been created yet.'
          }
          action={
            canManageBudget && !permissionsLoading ? (
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Create Your First Budget
              </button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-4">
          {budgets.map((budget) => {
            const usagePercent =
              parseFloat(budget.capAmount) > 0
                ? (
                    (parseFloat(budget.currentCommitted) / parseFloat(budget.capAmount)) *
                    100
                  ).toFixed(1)
                : '0';
            const available = (
              parseFloat(budget.capAmount) - parseFloat(budget.currentCommitted)
            ).toFixed(2);

            return (
              <div
                key={budget.id}
                className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">{budget.name}</h3>
                    <p className="mt-1 text-sm text-gray-600">
                      {budget.tokenSymbol} • Cap: {parseFloat(budget.capAmount).toLocaleString()}
                    </p>
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-gray-600">Usage</span>
                        <span className="font-medium">
                          {usagePercent}% ({parseFloat(budget.currentCommitted).toLocaleString()} /{' '}
                          {parseFloat(budget.capAmount).toLocaleString()})
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        <div
                          className={`h-full transition-all ${
                            parseFloat(usagePercent) > 90
                              ? 'bg-red-500'
                              : parseFloat(usagePercent) > 75
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(parseFloat(usagePercent), 100)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Available: {available} {budget.tokenSymbol}
                      </p>
                    </div>
                  </div>
                  {canManageBudget && (
                    <button
                      onClick={() => handleDelete(budget.id)}
                      className="ml-4 rounded-md border border-red-300 bg-white px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="mt-4 border-t pt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-700">Assigned Departments</h4>
                    {canManageBudget && (
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAssignDepartment(budget.id, e.target.value);
                            e.target.value = '';
                          }
                        }}
                        disabled={assigningBudget === budget.id}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                      >
                        <option value="">Assign to department...</option>
                        {departments
                          .filter((dept) => !budget.departments.some((bd) => bd.id === dept.id))
                          .map((dept) => (
                            <option key={dept.id} value={dept.id}>
                              {dept.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {budget.departments.length === 0 ? (
                      <p className="text-xs text-gray-500">No departments assigned</p>
                    ) : (
                      budget.departments.map((dept) => (
                        <span
                          key={dept.id}
                          className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800"
                        >
                          <Building2 className="h-3 w-3" />
                          {dept.name}
                          {canManageBudget && (
                            <button
                              onClick={() => handleUnassignDepartment(budget.id, dept.id)}
                              className="ml-1 hover:text-blue-900"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
