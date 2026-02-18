/**
 * Notification Settings API
 * GET: Get notification settings for organization
 * POST: Update notification settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { z } from 'zod';

const updateSettingsSchema = z.object({
  slackWebhookUrl: z.string().url().nullable().optional(),
  emailRecipients: z.array(z.string().email()).optional(),
});

async function getSettingsHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const settings = await db.organizationNotificationSettings.findUnique({
      where: { organizationId: session.organizationId },
    });

    return NextResponse.json({
      slackWebhookUrl: settings?.slackWebhookUrl || null,
      emailRecipients: (settings?.emailRecipients as string[] | null) || [],
    });
  } catch (error) {
    console.error('Get notification settings error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get notification settings',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

async function updateSettingsHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    const body = await request.json();
    const { slackWebhookUrl, emailRecipients } = updateSettingsSchema.parse(body);

    // Upsert settings
    const settings = await db.organizationNotificationSettings.upsert({
      where: { organizationId: session.organizationId },
      create: {
        organizationId: session.organizationId,
        slackWebhookUrl: slackWebhookUrl || null,
        emailRecipients: emailRecipients || [],
      },
      update: {
        slackWebhookUrl: slackWebhookUrl !== undefined ? slackWebhookUrl : undefined,
        emailRecipients: emailRecipients !== undefined ? emailRecipients : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      settings: {
        slackWebhookUrl: settings.slackWebhookUrl,
        emailRecipients: settings.emailRecipients as string[],
      },
    });
  } catch (error) {
    console.error('Update notification settings error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: 'Failed to update notification settings',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(getSettingsHandler, {
  permissions: ['VIEW_FINANCE_DASHBOARD'], // Or create a new permission
});

export const POST = withAuthAndRBAC(updateSettingsHandler, {
  permissions: ['VIEW_FINANCE_DASHBOARD'], // Or create a new permission
});

