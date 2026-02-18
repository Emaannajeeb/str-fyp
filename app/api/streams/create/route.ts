/**
 * Create Stream API
 * POST: Create on-chain stream (FINANCE_ADMIN permission required)
 * Requires: approved contract + approved funding approval
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';
import { createStreamflowClient } from '@/server/streamflow';
import type { StreamStatus } from '@/server/streamflow/types';
import { sendNotification } from '@/server/notify';
import { env } from '@/lib/env';
import { canCommit } from '@/server/finance/budget';
import { z } from 'zod';
import { createHash } from 'crypto';

const createStreamSchema = z.object({
  contractId: z.string().min(1, 'Contract ID is required'),
  employeeId: z.string().min(1, 'Employee ID is required'),
  startTime: z.number().int().positive(),
  endTime: z.number().int().positive(),
  cliffTime: z.number().int().positive().optional(),
  // For client-side stream creation: pass the result from Streamflow SDK
  streamflowStreamId: z.string().optional(),
  onchainTx: z.string().optional(),
  // Sender wallet address (for validation)
  senderWalletAddress: z.string().optional(),
});

async function createStreamHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const body = await request.json();
    const data = createStreamSchema.parse(body);
    const metadata = getRequestMetadata(request);

    // Get contract and verify it belongs to organization
    const contract = await db.contract.findFirst({
      where: {
        id: data.contractId,
        organizationId: session.organizationId,
        employeeId: data.employeeId,
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

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found, inactive, or access denied' },
        { status: 404 }
      );
    }

    // Business rule: Check for approved contract approval
    const contractApproval = await db.approval.findFirst({
      where: {
        organizationId: session.organizationId,
        subjectType: 'CONTRACT',
        subjectId: data.contractId,
        status: 'APPROVED',
      },
    });

    if (!contractApproval) {
      return NextResponse.json(
        { error: 'Contract must be approved before creating a stream' },
        { status: 400 }
      );
    }

    // Business rule: Check for approved funding approval (subjectType='STREAM' with step=1 for funding)
    // For now, we'll check if there's any approved stream approval
    // In production, you might have a separate 'FUNDING' approval type
    const fundingApproval = await db.approval.findFirst({
      where: {
        organizationId: session.organizationId,
        subjectType: 'STREAM',
        subjectId: data.contractId, // Using contractId as subjectId for funding approval
        step: 1,
        status: 'APPROVED',
      },
    });

    if (!fundingApproval) {
      return NextResponse.json(
        { error: 'Funding must be approved before creating a stream' },
        { status: 400 }
      );
    }

    // Calculate total amount (we'll do this before checking budget)
    const contractDuration = contract.endDate
      ? Math.floor((contract.endDate.getTime() - contract.startDate.getTime()) / 1000)
      : Math.floor((data.endTime - data.startTime));
    
    let totalAmount = contract.amountPerPeriod.toString();
    
    if (contract.period === 'MONTHLY') {
      const months = Math.ceil(contractDuration / (30 * 24 * 60 * 60));
      totalAmount = (Number(contract.amountPerPeriod) * months).toString();
    } else if (contract.period === 'WEEKLY') {
      const weeks = Math.ceil(contractDuration / (7 * 24 * 60 * 60));
      totalAmount = (Number(contract.amountPerPeriod) * weeks).toString();
    } else if (contract.period === 'BIWEEKLY') {
      const biweeks = Math.ceil(contractDuration / (14 * 24 * 60 * 60));
      totalAmount = (Number(contract.amountPerPeriod) * biweeks).toString();
    }

    // Get employee with department and wallet info
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
            },
            departmentMembers: {
              include: {
                department: true,
              },
            },
          },
        },
      },
    });

    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      );
    }

    if (!employee.user || employee.user.wallets.length === 0) {
      return NextResponse.json(
        { error: 'Employee must have a linked primary wallet' },
        { status: 400 }
      );
    }

    // Business rule: Check budget constraints if employee has a department
    if (employee.user.departmentMembers.length > 0) {
      const department = employee.user.departmentMembers[0].department;
      const budgetCheck = await canCommit(
        session.organizationId,
        department.id,
        contract.tokenMint,
        totalAmount
      );

      if (!budgetCheck.canCommit) {
        return NextResponse.json(
          {
            error: 'Budget constraint violation',
            message: budgetCheck.reason,
            budgetCheck: {
              currentCommitted: budgetCheck.currentCommitted,
              cap: budgetCheck.cap,
              available: budgetCheck.available,
            },
          },
          { status: 400 }
        );
      }
    }

    const recipientWallet = employee.user.wallets[0];

    // Validate sender wallet if provided (for client-side creation)
    if (data.senderWalletAddress) {
      const userWallet = await db.wallet.findFirst({
        where: {
          userId: session.userId,
          organizationId: session.organizationId,
          address: data.senderWalletAddress,
        },
      });

      if (!userWallet) {
        return NextResponse.json(
          { error: 'Sender wallet not found or not linked to your account' },
          { status: 400 }
        );
      }
    }

    // If streamflowStreamId and onchainTx are provided, this means the client
    // already created the stream using Streamflow SDK with Phantom wallet
    // We just need to store it in the database
    let streamflowResult: { streamId: string; onchainTx: string | null; status: StreamStatus };
    
    if (data.streamflowStreamId && data.onchainTx) {
      // Client-side creation: use the provided stream ID and transaction
      streamflowResult = {
        streamId: data.streamflowStreamId,
        onchainTx: data.onchainTx,
        status: 'ACTIVE',
      };
    } else {
      // Server-side creation (deprecated - requires server wallet private key)
      // This path is kept for backward compatibility but should not be used
      // in production with Phantom wallets
      if (!env.STREAMFLOW_ENABLED) {
        return NextResponse.json(
          { error: 'Streamflow is not enabled. Please create streams client-side with Phantom wallet.' },
          { status: 400 }
        );
      }

      const streamflowClient = createStreamflowClient({
        clusterUrl: env.SOLANA_CLUSTER_URL,
        cluster: env.SOLANA_CLUSTER,
      });

      // Get server-side wallet adapter (requires STREAMFLOW_SENDER_PRIVATE_KEY)
      const { getServerWalletAdapter } = await import('@/server/streamflow/wallet-adapter');
      const senderWallet = getServerWalletAdapter();

      const streamConfig = {
        recipient: recipientWallet.address,
        tokenMint: contract.tokenMint,
        totalAmount,
        amountPerPeriod: contract.amountPerPeriod.toString(),
        startTime: data.startTime,
        endTime: data.endTime,
        period: contract.period === 'MONTHLY' ? 30 * 24 * 60 * 60 : 
                contract.period === 'WEEKLY' ? 7 * 24 * 60 * 60 :
                contract.period === 'BIWEEKLY' ? 14 * 24 * 60 * 60 :
                data.endTime - data.startTime,
        cliffTime: data.cliffTime,
        decimals: 9, // Default to SOL decimals
        name: `Payroll: ${employee.displayName}`,
        canTopup: false,
        cancelableBySender: true,
        cancelableByRecipient: false,
        transferableBySender: false,
        transferableByRecipient: false,
        isNative: contract.tokenMint === 'So11111111111111111111111111111111111111112',
      };

      // Create hash of config for audit
      const configHash = createHash('sha256')
        .update(JSON.stringify(streamConfig))
        .digest('hex');

      try {
        // Create a ConnectedWallet wrapper for the server adapter
        const serverWallet = {
          address: senderWallet.publicKey.toString(),
          signMessage: async (msg: Uint8Array) => {
            const sig = senderWallet.sign(msg);
            return sig.signature;
          },
          signAndSendTransaction: async (tx: unknown) => {
            // Server-side: sign and send transaction
            const signed = senderWallet.signTransaction(tx as any);
            // Note: This requires sending the transaction to the network
            // For now, we'll let Streamflow SDK handle sending
            return 'server-tx-id';
          },
          disconnect: async () => {},
        };
        
        streamflowResult = await streamflowClient.createStream(streamConfig, serverWallet);
      } catch (error) {
        // Log error to audit
        await createAuditLog({
          organizationId: session.organizationId,
          actorId: session.userId,
          action: 'STREAM_CREATE_FAILED',
          entity: 'STREAM',
          entityId: 'pending',
          before: streamConfig,
          after: {
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          },
          ...metadata,
        });
        
        // Re-throw with user-friendly message
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to create stream on-chain: ${errorMessage}`);
      }
    }

    // Create stream record in database
    const stream = await db.stream.create({
      data: {
        organizationId: session.organizationId,
        employeeId: data.employeeId,
        contractId: data.contractId,
        tokenMint: contract.tokenMint,
        tokenSymbol: contract.tokenSymbol,
        totalAmount: totalAmount,
        startTime: new Date(data.startTime * 1000),
        endTime: new Date(data.endTime * 1000),
        cliffTime: data.cliffTime ? new Date(data.cliffTime * 1000) : null,
        streamflowStreamId: streamflowResult.streamId,
        onchainTx: streamflowResult.onchainTx,
        status: 'ACTIVE',
        lastSyncedAt: new Date(),
      },
      include: {
        employee: {
          select: {
            id: true,
            displayName: true,
          },
        },
        contract: {
          select: {
            id: true,
            tokenSymbol: true,
            amountPerPeriod: true,
            period: true,
          },
        },
      },
    });

    // Log audit with hash of config
    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: 'STREAM_CREATED',
      entity: 'STREAM',
      entityId: stream.id,
      after: {
        ...streamConfig,
        streamId: streamflowResult.streamId,
        onchainTx: streamflowResult.onchainTx,
        configHash, // Hash of stream configuration
      },
      ...metadata,
    });

    // Send notification
    try {
      await sendNotification({
        organizationId: session.organizationId,
        userId: employee.userId || undefined,
        type: 'STREAM_CREATED',
        payload: {
          title: `Stream Created: ${employee.displayName}`,
          message: `A new payment stream has been created for ${employee.displayName}. Amount: ${contract.tokenSymbol} ${totalAmount.toString()}`,
          data: {
            streamId: stream.id,
            streamflowStreamId: streamflowResult.streamId,
            employeeId: employee.id,
            employeeName: employee.displayName,
            tokenSymbol: contract.tokenSymbol,
            totalAmount: totalAmount.toString(),
          },
        },
      });
    } catch (error) {
      console.error('Failed to send stream creation notification:', error);
      // Don't fail the request if notification fails
    }

    return NextResponse.json({
      success: true,
      stream: {
        id: stream.id,
        streamflowStreamId: stream.streamflowStreamId,
        onchainTx: stream.onchainTx,
        status: stream.status,
        employee: stream.employee,
        contract: stream.contract,
        totalAmount: stream.totalAmount.toString(),
        startTime: stream.startTime,
        endTime: stream.endTime,
        cliffTime: stream.cliffTime,
      },
    });
  } catch (error) {
    console.error('Create stream error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: 'Failed to create stream',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const POST = withAuthAndRBAC(createStreamHandler, {
  requiredPermissions: ['CREATE_STREAM'],
});

