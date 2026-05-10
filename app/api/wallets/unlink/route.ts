/**
 * Unlink a wallet from the current user
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { z } from 'zod';

const unlinkWalletSchema = z.object({
  walletId: z.string().min(1, 'Wallet ID is required'),
});

async function unlinkWalletHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const body = await request.json();
    const { walletId } = unlinkWalletSchema.parse(body);
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

    // Store wallet data for audit before deletion
    const walletData = {
      id: wallet.id,
      address: wallet.address,
      provider: wallet.provider,
      network: wallet.network,
      isPrimary: wallet.isPrimary,
    };

    // Delete wallet
    await db.wallet.delete({
      where: { id: walletId },
    });

    // If it was primary, set another wallet as primary if available
    if (wallet.isPrimary) {
      const nextWallet = await db.wallet.findFirst({
        where: {
          userId: session.userId,
          organizationId: session.organizationId,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (nextWallet) {
        await db.wallet.update({
          where: { id: nextWallet.id },
          data: { isPrimary: true },
        });
      }
    }

    // Log wallet unlink
    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: 'WALLET_UNLINKED',
      entity: 'WALLET',
      entityId: walletId,
      before: walletData,
      after: null,
      ...metadata,
    });

    return NextResponse.json({
      success: true,
      message: 'Wallet unlinked successfully',
    });
  } catch (error) {
    console.error('Unlink wallet error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: 'Failed to unlink wallet',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const POST = withAuthAndRBAC(unlinkWalletHandler, {
  requiredPermissions: [], // Any authenticated user can unlink their wallet
});

