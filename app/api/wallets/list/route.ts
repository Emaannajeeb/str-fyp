/**
 * List wallets for the current user
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';

async function listWalletsHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const wallets = await db.wallet.findMany({
      where: {
        userId: session.userId,
        organizationId: session.organizationId,
      },
      select: {
        id: true,
        address: true,
        provider: true,
        network: true,
        isPrimary: true,
        createdAt: true,
      },
      orderBy: [
        { isPrimary: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json({
      success: true,
      wallets,
    });
  } catch (error) {
    console.error('List wallets error:', error);
    return NextResponse.json(
      {
        error: 'Failed to list wallets',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(listWalletsHandler, {
  requiredPermissions: [], // Any authenticated user can view their wallets
});

