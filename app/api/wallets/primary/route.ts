/**
 * Set a wallet as primary
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { z } from 'zod';

const setPrimarySchema = z.object({
  walletId: z.string().min(1, 'Wallet ID is required'),
});

async function setPrimaryHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const body = await request.json();
    const { walletId } = setPrimarySchema.parse(body);
    const metadata = getRequestMetadata(request);

    // Verify wallet belongs to user
    const wallet = await db.wallet.findFirst({
      where: {
        id: walletId,
        userId: session.userId,
        organizationId: session.organizationId,
      },
    });

    if (!wallet) {
      return NextResponse.json(
        { error: 'Wallet not found or access denied' },
        { status: 404 }
      );
    }

    // If already primary, no change needed
    if (wallet.isPrimary) {
      return NextResponse.json({
        success: true,
        message: 'Wallet is already primary',
      });
    }

    // Get old primary wallet for audit
    const oldPrimary = await db.wallet.findFirst({
      where: {
        userId: session.userId,
        organizationId: session.organizationId,
        isPrimary: true,
      },
    });

    // Unset current primary
    await db.wallet.updateMany({
      where: {
        userId: session.userId,
        organizationId: session.organizationId,
        isPrimary: true,
      },
      data: {
        isPrimary: false,
      },
    });

    // Set new primary
    const updatedWallet = await db.wallet.update({
      where: { id: walletId },
      data: { isPrimary: true },
    });

    // Log wallet primary change
    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: 'WALLET_PRIMARY_CHANGED',
      entity: 'WALLET',
      entityId: walletId,
      before: oldPrimary
        ? {
            oldPrimaryId: oldPrimary.id,
            oldPrimaryAddress: oldPrimary.address,
          }
        : null,
      after: {
        newPrimaryId: updatedWallet.id,
        newPrimaryAddress: updatedWallet.address,
      },
      ...metadata,
    });

    return NextResponse.json({
      success: true,
      wallet: {
        id: updatedWallet.id,
        address: updatedWallet.address,
        provider: updatedWallet.provider,
        network: updatedWallet.network,
        isPrimary: updatedWallet.isPrimary,
      },
    });
  } catch (error) {
    console.error('Set primary wallet error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: 'Failed to set primary wallet',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const POST = withAuthAndRBAC(setPrimaryHandler, {
  requiredPermissions: [], // Any authenticated user can set their primary wallet
});

