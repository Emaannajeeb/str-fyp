/**
 * Get SOL balance for a wallet address
 * Query param: address (optional; if omitted, uses current user's primary wallet)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { getSolBalance } from '@/server/wallet/get-balance';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';

async function getBalanceHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    let walletAddress: string;

    if (address) {
      // Validate that the address belongs to a wallet linked by this user in this org
      const wallet = await db.wallet.findFirst({
        where: {
          address,
          userId: session.userId,
          organizationId: session.organizationId,
        },
      });
      if (!wallet) {
        return NextResponse.json({ error: 'Wallet not found or access denied' }, { status: 403 });
      }
      walletAddress = address;
    } else {
      // Use current user's primary wallet
      const primaryWallet = await db.wallet.findFirst({
        where: {
          userId: session.userId,
          organizationId: session.organizationId,
          isPrimary: true,
        },
      });
      if (!primaryWallet) {
        return NextResponse.json(
          { error: 'No primary wallet linked. Link a wallet in Settings > Wallets.' },
          { status: 400 }
        );
      }
      walletAddress = primaryWallet.address;
    }

    const balance = await getSolBalance(walletAddress);

    return NextResponse.json({
      success: true,
      balance,
      address: walletAddress,
    });
  } catch (error) {
    console.error('Get balance error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch balance',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(getBalanceHandler, {
  requiredPermissions: [],
});
