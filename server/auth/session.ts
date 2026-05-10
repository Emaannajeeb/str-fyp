/**
 * Session management with JWT
 * Uses HttpOnly cookies for secure session storage
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { db } from '../db';
import { env } from '@/lib/env';
import type { Session } from '@/lib/auth';

const SESSION_COOKIE_NAME = 'session_token';
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours in seconds
const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

function sessionCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  maxAge: number;
  path: string;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  };
}

function refreshCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  maxAge: number;
  path: string;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: REFRESH_MAX_AGE,
    path: '/',
  };
}

// Get JWT secret key
function getJWTSecret(): Uint8Array {
  const secret = env.JWT_SECRET;
  return new TextEncoder().encode(secret);
}

/**
 * Issue JWT session + refresh tokens after validating org membership.
 * Does not set cookies (use createSession or attachSessionToResponse).
 */
export async function issueSessionTokens(
  userId: string,
  organizationId: string
): Promise<{ sessionToken: string; refreshToken: string }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const userRole = await db.userRole.findFirst({
    where: {
      userId,
      organizationId,
    },
  });

  if (!userRole) {
    throw new Error('User does not have access to this organization');
  }

  const secret = getJWTSecret();
  const now = Math.floor(Date.now() / 1000);

  const sessionToken = await new SignJWT({
    userId,
    organizationId,
    email: user.email,
    name: user.name,
    type: 'session',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_MAX_AGE)
    .setSubject(userId)
    .sign(secret);

  const refreshToken = await new SignJWT({
    userId,
    organizationId,
    type: 'refresh',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + REFRESH_MAX_AGE)
    .setSubject(userId)
    .sign(secret);

  return { sessionToken, refreshToken };
}

/**
 * Attach session cookies to a Route Handler response (e.g. OAuth redirect).
 * Required because cookies() + NextResponse.redirect() may not merge Set-Cookie reliably.
 */
export function attachSessionToResponse(
  response: NextResponse,
  tokens: { sessionToken: string; refreshToken: string }
): void {
  response.cookies.set(SESSION_COOKIE_NAME, tokens.sessionToken, sessionCookieOptions());
  response.cookies.set(REFRESH_COOKIE_NAME, tokens.refreshToken, refreshCookieOptions());
}

/**
 * Create a session for a user
 * @param userId - User ID
 * @param organizationId - Organization ID
 * @returns Session token and refresh token
 */
export async function createSession(
  userId: string,
  organizationId: string
): Promise<{ sessionToken: string; refreshToken: string }> {
  const tokens = await issueSessionTokens(userId, organizationId);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, tokens.sessionToken, sessionCookieOptions());
  cookieStore.set(REFRESH_COOKIE_NAME, tokens.refreshToken, refreshCookieOptions());

  return tokens;
}

/**
 * Get session from cookies
 * @returns Session object or null if not authenticated
 */
export async function getSession(): Promise<Session | null> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionToken) {
      return null;
    }

    const secret = getJWTSecret();
    const { payload } = await jwtVerify(sessionToken, secret);

    if (payload.type !== 'session') {
      return null;
    }

    return {
      userId: payload.userId as string,
      organizationId: payload.organizationId as string,
      email: payload.email as string | undefined,
      name: payload.name as string | undefined,
    };
  } catch {
    // Token invalid or expired
    return null;
  }
}

/**
 * Refresh session using refresh token
 * @returns New session token or null if refresh failed
 */
export async function refreshSession(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(REFRESH_COOKIE_NAME)?.value;

    if (!refreshToken) {
      return null;
    }

    const secret = getJWTSecret();
    const { payload } = await jwtVerify(refreshToken, secret);

    if (payload.type !== 'refresh') {
      return null;
    }

    const userId = payload.userId as string;
    const organizationId = payload.organizationId as string;

    // Get user details
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (!user) {
      return null;
    }

    // Create new session token
    const now = Math.floor(Date.now() / 1000);
    const sessionToken = await new SignJWT({
      userId,
      organizationId,
      email: user.email,
      name: user.name,
      type: 'session',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + SESSION_MAX_AGE)
      .setSubject(userId)
      .sign(secret);

    // Update session cookie
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions());

    return sessionToken;
  } catch {
    return null;
  }
}

/**
 * Destroy session (logout)
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete(REFRESH_COOKIE_NAME);
}
