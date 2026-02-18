/**
 * Sign-out API route
 */

import { NextRequest, NextResponse } from 'next/server';
import { destroySession } from '@/server/auth/session';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';

export async function POST(request: NextRequest) {
  try {
    // Get session before destroying it
    const session = await requireAuth(request);
    const metadata = getRequestMetadata(request);

    // Destroy session
    await destroySession();

    // Log logout
    await createAuditLog({
      organizationId: session.organizationId,
      actorId: session.userId,
      action: 'LOGOUT',
      entity: 'USER',
      entityId: session.userId,
      after: { method: 'signout' },
      ...metadata,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    // Even if auth fails, try to destroy session
    await destroySession();

    return NextResponse.json({ success: true });
  }
}

