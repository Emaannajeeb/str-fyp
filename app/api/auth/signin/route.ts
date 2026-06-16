/**
 * Sign-in API route
 * Supports email magic link (simplified)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { createSession } from '@/server/auth/session';
import { createAuditLog, getRequestMetadata } from '@/server/auth/audit';
import { rateLimiters } from '@/lib/middleware/rate-limit';
import { withCsrfProtection } from '@/lib/middleware/csrf';
import { z } from 'zod';

const signInSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().optional(),
  otp: z.string().optional(), // For demo purposes
});

async function signInHandler(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = signInSchema.parse(body);
    const metadata = getRequestMetadata(request);

    // For demo: if email provided, create/find user and sign in
    // In production, this would send a magic link email
    if (email) {
      // Find or create user
      let user = await db.user.findUnique({
        where: { email },
      });

      if (!user) {
        // For demo: create user if doesn't exist
        // In production, this would require email verification first
        user = await db.user.create({
          data: {
            email,
            name: email.split('@')[0],
          },
        });
      }

      // Find user's first organization (for demo)
      // In production, user would select organization
      const userRole = await db.userRole.findFirst({
        where: { userId: user.id },
        include: { organization: true },
      });

      if (!userRole) {
        // For demo: assign to first organization or create one
        const org = await db.organization.findFirst();
        if (!org) {
          return NextResponse.json(
            { error: 'No organization found. Please contact administrator.' },
            { status: 400 }
          );
        }

        // Don't auto-assign EMPLOYEE role to predefined admin users
        // They should have their roles assigned via seed script
        const isAdminUser = email === 'sysadmin@demo-corp.com' || email === 'admin@demo-corp.com';

        if (!isAdminUser) {
          // Assign default role (EMPLOYEE) for regular users
          const employeeRole = await db.role.findUnique({
            where: { key: 'EMPLOYEE' },
          });

          if (employeeRole) {
            await db.userRole.create({
              data: {
                userId: user.id,
                organizationId: org.id,
                roleId: employeeRole.id,
              },
            });
          }
        } else {
          // For admin users, check if they have a role assigned
          // If not, they need to run the seed script
          const hasRole = await db.userRole.findFirst({
            where: {
              userId: user.id,
              organizationId: org.id,
            },
          });

          if (!hasRole) {
            return NextResponse.json(
              { error: 'Admin user not configured. Please run the seed script.' },
              { status: 403 }
            );
          }
        }

        // Create session
        await createSession(user.id, org.id);

        // Log login
        await createAuditLog({
          organizationId: org.id,
          actorId: user.id,
          action: 'LOGIN',
          entity: 'USER',
          entityId: user.id,
          after: { method: 'email', email },
          ...metadata,
        });

        return NextResponse.json({
          success: true,
          userId: user.id,
          organizationId: org.id,
        });
      }

      // Create session
      await createSession(user.id, userRole.organizationId);

      // Log login
      await createAuditLog({
        organizationId: userRole.organizationId,
        actorId: user.id,
        action: 'LOGIN',
        entity: 'USER',
        entityId: user.id,
        after: { method: 'email', email },
        ...metadata,
      });

      return NextResponse.json({
        success: true,
        userId: user.id,
        organizationId: userRole.organizationId,
      });
    }

    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  } catch (error) {
    console.error('Sign-in error:', error);
    return NextResponse.json(
      {
        error: 'Sign-in failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Apply rate limiting and CSRF protection
export const POST = async (request: NextRequest) => {
  return rateLimiters.auth(request, async (req) => {
    return withCsrfProtection(signInHandler)(req);
  });
};
