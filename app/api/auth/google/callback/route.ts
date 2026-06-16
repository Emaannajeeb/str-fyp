/**
 * Google OAuth callback: exchange code for tokens, get user info, create session
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { attachSessionToResponse, issueSessionTokens } from '@/server/auth/session';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';
import { env } from '@/lib/env';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const errorParam = searchParams.get('error');

  const signInUrl = new URL('/signin', origin);
  const appUrl = new URL('/home', origin);

  if (errorParam) {
    signInUrl.searchParams.set(
      'error',
      errorParam === 'access_denied' ? 'Access denied' : errorParam
    );
    return NextResponse.redirect(signInUrl);
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    signInUrl.searchParams.set('error', 'Google sign-in is not configured');
    return NextResponse.redirect(signInUrl);
  }

  if (!code) {
    signInUrl.searchParams.set('error', 'Missing authorization code');
    return NextResponse.redirect(signInUrl);
  }

  // Must match the redirect_uri used in /api/auth/google (same request host as the browser).
  const redirectUri = new URL('/api/auth/google/callback', origin).toString();

  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('Google token error:', err);
      signInUrl.searchParams.set('error', 'Google sign-in failed');
      return NextResponse.redirect(signInUrl);
    }

    const tokens = (await tokenRes.json()) as { access_token: string };
    const accessToken = tokens.access_token;

    const userRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) {
      signInUrl.searchParams.set('error', 'Failed to load profile');
      return NextResponse.redirect(signInUrl);
    }

    const profile = (await userRes.json()) as { email: string; name?: string };
    const email = profile.email;
    if (!email) {
      signInUrl.searchParams.set('error', 'Google account has no email');
      return NextResponse.redirect(signInUrl);
    }

    const metadata = getRequestMetadata(request);

    // Find or create user and use first org or default org
    let user = await db.user.findUnique({ where: { email } });
    if (!user) {
      user = await db.user.create({
        data: {
          email,
          name: profile.name ?? email.split('@')[0],
        },
      });
    }

    const userRole = await db.userRole.findFirst({
      where: { userId: user.id },
      include: { organization: true },
    });

    let organizationId: string;
    if (!userRole) {
      const org = await db.organization.findFirst();
      if (!org) {
        signInUrl.searchParams.set('error', 'No organization found. Please contact support.');
        return NextResponse.redirect(signInUrl);
      }
      const employeeRole = await db.role.findUnique({ where: { key: 'EMPLOYEE' } });
      if (!employeeRole) {
        signInUrl.searchParams.set(
          'error',
          'Sign-in is not available yet. Run database seed or contact support.'
        );
        return NextResponse.redirect(signInUrl);
      }
      await db.userRole.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          roleId: employeeRole.id,
        },
      });
      organizationId = org.id;
    } else {
      organizationId = userRole.organizationId;
    }

    const oauthTokens = await issueSessionTokens(user.id, organizationId);
    await createAuditLog({
      organizationId,
      actorId: user.id,
      action: 'LOGIN',
      entity: 'USER',
      entityId: user.id,
      after: { method: 'google', email },
      ...metadata,
    });

    const oauthSuccess = NextResponse.redirect(appUrl);
    attachSessionToResponse(oauthSuccess, oauthTokens);
    return oauthSuccess;
  } catch (err) {
    console.error('Google callback error:', err);
    signInUrl.searchParams.set('error', 'Sign-in failed');
    return NextResponse.redirect(signInUrl);
  }
}
