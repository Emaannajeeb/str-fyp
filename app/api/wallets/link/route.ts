/**
 * Link a wallet to the current user
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { env } from '@/lib/env';
import { z } from 'zod';

const linkWalletSchema = z.object({
  address: z.string().min(1, 'Address is required'),
  provider: z.string().min(1, 'Provider is required'),
  network: z.string().optional(), // Optional, will use env SOLANA_CLUSTER if not provided
});

async function linkWalletHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const body = await request.json();
    const { address, provider, network: providedNetwork } = linkWalletSchema.parse(body);
    const metadata = getRequestMetadata(request);

    // Use provided network or fall back to env SOLANA_CLUSTER
    const network = providedNetwork || env.SOLANA_CLUSTER;

    // Check if wallet already exists for this user+org
    const existingWallet = await db.wallet.findFirst({
      where: {
        userId: session.userId,
        organizationId: session.organizationId,
        address,
      },
    });

    if (existingWallet) {
      return NextResponse.json(
        { error: 'Wallet already linked' },
        { status: 400 }
      );
    }

    // Check if user already has a primary wallet
    const hasPrimaryWallet = await db.wallet.findFirst({
      where: {
        userId: session.userId,
        organizationId: session.organizationId,
        isPrimary: true,
      },
    });

    // Create wallet (set as primary if user doesn't have one)
    const wallet = await db.wallet.create({
      data: {
        userId: session.userId,
        organizationId: session.organizationId,
        address,
        provider,
        network,
        isPrimary: !hasPrimaryWallet, // First wallet becomes primary
      },
    });

    // Log wallet link
    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: 'WALLET_LINKED',
      entity: 'WALLET',
      entityId: wallet.id,
      after: {
        address,
        provider,
        network,
        isPrimary: wallet.isPrimary,
      },
      ...metadata,
    });

    return NextResponse.json({
      success: true,
      wallet: {
        id: wallet.id,
        address: wallet.address,
        provider: wallet.provider,
        network: wallet.network,
        isPrimary: wallet.isPrimary,
      },
    });
  } catch (error) {
    console.error('Link wallet error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: 'Failed to link wallet',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const POST = withAuthAndRBAC(linkWalletHandler, {
  requiredPermissions: [], // Any authenticated user can link their wallet
});

