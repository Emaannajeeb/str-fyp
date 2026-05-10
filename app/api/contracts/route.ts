/**
 * Contracts API
 * GET: List contracts
 * POST: Create contract (HR permission required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';
import { z } from 'zod';
import { Decimal } from '@prisma/client/runtime/library';

async function listContractsHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const { searchParams } = new URL(request.url);
    const eligibleForStream = searchParams.get('eligibleForStream') === 'true';

    const baseWhere = {
      organizationId: session.organizationId,
      active: true,
    };

    let contracts;

    if (eligibleForStream) {
      contracts = await db.contract.findMany({
        where: baseWhere,
        include: {
          employee: {
            include: {
              user: {
                include: {
                  wallets: {
                    where: {
                      organizationId: session.organizationId,
                      isPrimary: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      const contractIds = contracts.map((c) => c.id);
      const [contractApprovals, streamApprovals, existingStreams] = await Promise.all([
        db.approval.findMany({
          where: {
            organizationId: session.organizationId,
            subjectType: 'CONTRACT',
            subjectId: { in: contractIds },
            status: 'APPROVED',
          },
          select: { subjectId: true },
        }),
        db.approval.findMany({
          where: {
            organizationId: session.organizationId,
            subjectType: 'STREAM',
            subjectId: { in: contractIds },
            step: 1,
            status: 'APPROVED',
          },
          select: { subjectId: true },
        }),
        db.stream.findMany({
          where: { contractId: { in: contractIds } },
          select: { contractId: true },
        }),
      ]);
      const approvedContractIds = new Set(contractApprovals.map((a) => a.subjectId));
      const approvedStreamIds = new Set(streamApprovals.map((a) => a.subjectId));
      const hasStreamIds = new Set(existingStreams.map((s) => s.contractId));
      contracts = contracts.filter(
        (c) =>
          approvedContractIds.has(c.id) && approvedStreamIds.has(c.id) && !hasStreamIds.has(c.id)
      );
    } else {
      contracts = await db.contract.findMany({
        where: baseWhere,
        include: {
          employee: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return NextResponse.json({
      success: true,
      contracts: contracts.map((contract) => {
        const emp = contract.employee as {
          id: string;
          displayName: string;
          user?: { wallets: { address: string }[] };
        } | null;
        const recipientWallet =
          eligibleForStream && emp?.user?.wallets?.length ? emp.user.wallets[0].address : null;
        return {
          id: contract.id,
          employeeId: contract.employeeId,
          employee: emp
            ? {
                id: emp.id,
                displayName: emp.displayName,
                ...(recipientWallet != null ? { recipientWallet } : {}),
              }
            : null,
          tokenMint: contract.tokenMint,
          tokenSymbol: contract.tokenSymbol,
          rateType: contract.rateType,
          amountPerPeriod: contract.amountPerPeriod.toString(),
          period: contract.period,
          startDate: contract.startDate.toISOString(),
          endDate: contract.endDate?.toISOString() || null,
          active: contract.active,
          onchainTx: contract.onchainTx ?? null,
        };
      }),
    });
  } catch (error) {
    console.error('List contracts error:', error);
    return NextResponse.json(
      {
        error: 'Failed to list contracts',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

const createContractSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  tokenMint: z.string().min(1, 'Token mint is required'),
  tokenSymbol: z.string().min(1, 'Token symbol is required'),
  rateType: z.enum(['SALARY', 'HOURLY', 'MILESTONE']),
  amountPerPeriod: z.string().or(z.number()), // Accept string or number for Decimal
  period: z.enum(['MONTHLY', 'WEEKLY', 'BIWEEKLY', 'ONE_TIME']),
  startDate: z.string().datetime().or(z.date()),
  endDate: z.string().datetime().optional().or(z.date().optional()),
  notes: z.string().optional(),
  walletAddress: z.string().optional(), // Connected wallet address for on-chain transaction
  onchainTx: z.string().optional(), // Transaction signature if already created on-chain
});

async function createContractHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const body = await request.json();
    const data = createContractSchema.parse(body);
    const metadata = getRequestMetadata(request);

    // Verify employee belongs to organization and get employee wallet
    const employee = await db.employee.findFirst({
      where: {
        id: data.employeeId,
        organizationId: session.organizationId,
      },
      include: {
        user: {
          include: {
            wallets: {
              where: {
                organizationId: session.organizationId,
                isPrimary: true,
              },
              take: 1,
            },
          },
        },
      },
    });

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found or access denied' }, { status: 404 });
    }

    // Get employee's primary wallet address if available
    const employeeWallet = employee.user?.wallets[0]?.address;

    // Parse dates
    const startDate =
      typeof data.startDate === 'string' ? new Date(data.startDate) : data.startDate;
    const endDate = data.endDate
      ? typeof data.endDate === 'string'
        ? new Date(data.endDate)
        : data.endDate
      : undefined;

    // Convert amount to Decimal
    const amountPerPeriod = new Decimal(
      typeof data.amountPerPeriod === 'string'
        ? data.amountPerPeriod
        : data.amountPerPeriod.toString()
    );

    // Create contract (we'll update with onchainTx after transaction is created)
    const contract = await db.contract.create({
      data: {
        employeeId: data.employeeId,
        organizationId: session.organizationId,
        tokenMint: data.tokenMint,
        tokenSymbol: data.tokenSymbol,
        rateType: data.rateType,
        amountPerPeriod,
        period: data.period,
        startDate,
        endDate: endDate || null,
        notes: data.notes || null,
        active: true,
      },
      include: {
        employee: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    // Log audit
    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: 'CREATE',
      entity: 'CONTRACT',
      entityId: contract.id,
      after: {
        employeeId: contract.employeeId,
        tokenMint: contract.tokenMint,
        tokenSymbol: contract.tokenSymbol,
        rateType: contract.rateType,
        amountPerPeriod: contract.amountPerPeriod.toString(),
        period: contract.period,
        startDate: contract.startDate.toISOString(),
        endDate: contract.endDate?.toISOString() || null,
      },
      ...metadata,
    });

    // If wallet address is provided, prepare transaction data for client to sign
    let transactionData = null;
    if (data.walletAddress && !data.onchainTx) {
      const { createContractTransaction } = await import('@/server/contracts/create-onchain');
      const transaction = await createContractTransaction(
        {
          contractId: contract.id,
          employeeId: contract.employeeId,
          employeeWallet: employeeWallet || undefined,
          tokenMint: contract.tokenMint,
          tokenSymbol: contract.tokenSymbol,
          rateType: contract.rateType,
          amountPerPeriod: contract.amountPerPeriod.toString(),
          period: contract.period,
          startDate: contract.startDate.toISOString(),
          endDate: contract.endDate?.toISOString(),
          organizationId: session.organizationId,
        },
        data.walletAddress
      );

      // Serialize transaction for client to sign
      transactionData = {
        transaction: transaction.serialize({ requireAllSignatures: false }).toString('base64'),
        contractId: contract.id,
      };
    }

    // If onchainTx is already provided, update contract with it
    if (data.onchainTx) {
      // Note: We can't directly update the contract here since we don't have onchainTx field yet
      // For now, we'll return it in the response
      // You'll need to add onchainTx field to Contract model and run migration
    }

    return NextResponse.json({
      success: true,
      contract: {
        id: contract.id,
        employeeId: contract.employeeId,
        employee: contract.employee,
        tokenMint: contract.tokenMint,
        tokenSymbol: contract.tokenSymbol,
        rateType: contract.rateType,
        amountPerPeriod: contract.amountPerPeriod.toString(),
        period: contract.period,
        startDate: contract.startDate,
        endDate: contract.endDate,
        active: contract.active,
        onchainTx: data.onchainTx || null,
      },
      transactionData, // Transaction to sign if wallet address was provided
    });
  } catch (error) {
    console.error('Create contract error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: 'Failed to create contract',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(listContractsHandler, {
  requiredPermissions: ['VIEW_FINANCE_DASHBOARD', 'MANAGE_EMPLOYEES'], // Allow either permission
});

export const POST = withAuthAndRBAC(createContractHandler, {
  requiredPermissions: ['MANAGE_EMPLOYEES'],
});
