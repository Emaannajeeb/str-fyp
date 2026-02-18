/**
 * Budget management and enforcement helpers
 */

import { db } from '../db';
import { Decimal } from '@prisma/client/runtime/library';

export interface BudgetCheckResult {
  canCommit: boolean;
  reason?: string;
  currentCommitted: string;
  cap: string;
  available: string;
}

/**
 * Compute total committed amount for a token in an organization
 * This includes all active streams for contracts using this token
 */
export async function computeCommitted(
  organizationId: string,
  tokenMint: string
): Promise<string> {
  // Get all active streams for this token
  const streams = await db.stream.findMany({
    where: {
      organizationId,
      tokenMint,
      status: {
        in: ['ACTIVE', 'PAUSED'], // Only count active/paused streams as committed
      },
    },
    select: {
      totalAmount: true,
    },
  });

  // Sum up total amounts
  let total = new Decimal(0);
  for (const stream of streams) {
    total = total.add(stream.totalAmount);
  }

  return total.toString();
}

/**
 * Compute committed amount for a specific department and token
 */
export async function computeDepartmentCommitted(
  organizationId: string,
  departmentId: string,
  tokenMint: string
): Promise<string> {
  // Get department members
  const departmentMembers = await db.departmentMember.findMany({
    where: {
      departmentId,
    },
    select: {
      userId: true,
    },
  });

  const userIds = departmentMembers.map((dm) => dm.userId);

  // Get employees for these users
  const employees = await db.employee.findMany({
    where: {
      organizationId,
      userId: {
        in: userIds,
      },
    },
    select: {
      id: true,
    },
  });

  const employeeIds = employees.map((e) => e.id);

  // Get active streams for these employees with this token
  const streams = await db.stream.findMany({
    where: {
      organizationId,
      employeeId: {
        in: employeeIds,
      },
      tokenMint,
      status: {
        in: ['ACTIVE', 'PAUSED'],
      },
    },
    select: {
      totalAmount: true,
    },
  });

  // Sum up total amounts
  let total = new Decimal(0);
  for (const stream of streams) {
    total = total.add(stream.totalAmount);
  }

  return total.toString();
}

/**
 * Check if a department can commit a certain amount for a token
 * Returns whether it can commit and the reason if not
 */
export async function canCommit(
  organizationId: string,
  departmentId: string,
  tokenMint: string,
  amount: string
): Promise<BudgetCheckResult> {
  // Get department budgets for this token
  const departmentBudgets = await db.departmentBudget.findMany({
    where: {
      departmentId,
      budget: {
        organizationId,
        tokenMint,
      },
    },
    include: {
      budget: true,
    },
  });

  if (departmentBudgets.length === 0) {
    // No budget set for this department/token - allow (or you might want to block)
    return {
      canCommit: true,
      currentCommitted: '0',
      cap: '0',
      available: '0',
      reason: 'No budget set for this department and token',
    };
  }

  // Check each budget (department can have multiple budgets for same token)
  let totalCap = new Decimal(0);
  for (const db of departmentBudgets) {
    totalCap = totalCap.add(db.budget.capAmount);
  }

  // Get current committed amount
  const currentCommitted = await computeDepartmentCommitted(
    organizationId,
    departmentId,
    tokenMint
  );

  const committedDecimal = new Decimal(currentCommitted);
  const amountDecimal = new Decimal(amount);
  const newTotal = committedDecimal.add(amountDecimal);

  if (newTotal.gt(totalCap)) {
    return {
      canCommit: false,
      reason: `Committing ${amount} would exceed department budget cap of ${totalCap.toString()}. Current committed: ${currentCommitted}`,
      currentCommitted,
      cap: totalCap.toString(),
      available: totalCap.sub(committedDecimal).toString(),
    };
  }

  return {
    canCommit: true,
    currentCommitted,
    cap: totalCap.toString(),
    available: totalCap.sub(committedDecimal).sub(amountDecimal).toString(),
  };
}

/**
 * Check if organization-level budget allows committing amount
 */
export async function canCommitOrganization(
  organizationId: string,
  tokenMint: string,
  amount: string
): Promise<BudgetCheckResult> {
  // Get all budgets for this token in the organization
  const budgets = await db.budget.findMany({
    where: {
      organizationId,
      tokenMint,
    },
  });

  if (budgets.length === 0) {
    return {
      canCommit: true,
      currentCommitted: '0',
      cap: '0',
      available: '0',
      reason: 'No organization budget set for this token',
    };
  }

  // Sum up all budget caps
  let totalCap = new Decimal(0);
  for (const budget of budgets) {
    totalCap = totalCap.add(budget.capAmount);
  }

  // Get current committed
  const currentCommitted = await computeCommitted(organizationId, tokenMint);

  const committedDecimal = new Decimal(currentCommitted);
  const amountDecimal = new Decimal(amount);
  const newTotal = committedDecimal.add(amountDecimal);

  if (newTotal.gt(totalCap)) {
    return {
      canCommit: false,
      reason: `Committing ${amount} would exceed organization budget cap of ${totalCap.toString()}. Current committed: ${currentCommitted}`,
      currentCommitted,
      cap: totalCap.toString(),
      available: totalCap.sub(committedDecimal).toString(),
    };
  }

  return {
    canCommit: true,
    currentCommitted,
    cap: totalCap.toString(),
    available: totalCap.sub(committedDecimal).sub(amountDecimal).toString(),
  };
}

