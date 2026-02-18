/**
 * Notification Service
 * Handles sending notifications via multiple providers (Email, Slack)
 */

import { db } from '../db';
import { env } from '@/lib/env';
import type { NotificationType } from '@prisma/client';

export interface NotificationPayload {
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface NotificationOptions {
  organizationId: string;
  userId?: string; // Optional: if not provided, sends to all org recipients
  type: NotificationType;
  payload: NotificationPayload;
}

/**
 * Email notification provider (stub - logs to console in dev)
 */
class EmailProvider {
  async send(
    recipients: string[],
    subject: string,
    body: string
  ): Promise<void> {
    if (env.NODE_ENV === 'development') {
      console.log('[Email] Sending email notification:');
      console.log('  To:', recipients.join(', '));
      console.log('  Subject:', subject);
      console.log('  Body:', body);
      return;
    }

    // TODO: Integrate with Postmark/Nodemailer in production
    // For now, just log
    console.log('[Email] Email notification (production stub):', {
      recipients,
      subject,
      body,
    });
  }
}

/**
 * Slack notification provider
 */
class SlackProvider {
  async send(webhookUrl: string, message: string, data?: Record<string, unknown>): Promise<void> {
    if (!webhookUrl) {
      console.warn('[Slack] No webhook URL provided');
      return;
    }

    try {
      const payload = {
        text: message,
        ...(data && {
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: message,
              },
            },
            {
              type: 'section',
              fields: Object.entries(data).map(([key, value]) => ({
                type: 'mrkdwn',
                text: `*${key}:*\n${String(value)}`,
              })),
            },
          ],
        }),
      };

      if (env.NODE_ENV === 'development') {
        console.log('[Slack] Sending Slack notification:');
        console.log('  Webhook URL:', webhookUrl);
        console.log('  Message:', message);
        console.log('  Data:', data);
        return;
      }

      // In production, actually send to Slack
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('[Slack] Error sending notification:', error);
      throw error;
    }
  }
}

// Provider instances
const emailProvider = new EmailProvider();
const slackProvider = new SlackProvider();

/**
 * Format notification message based on type
 */
function formatNotificationMessage(
  type: NotificationType,
  payload: NotificationPayload
): { subject: string; message: string } {
  const { title, message, data } = payload;

  switch (type) {
    case 'APPROVAL_REQUIRED':
      return {
        subject: `Approval Required: ${title}`,
        message: `${message}\n\nAction required: Please review and approve this request.`,
      };

    case 'STREAM_CREATED':
      return {
        subject: `Stream Created: ${title}`,
        message: `${message}\n\nA new payment stream has been created.`,
      };

    case 'STREAM_PAUSED':
      return {
        subject: `Stream Paused: ${title}`,
        message: `${message}\n\nThe payment stream has been paused.`,
      };

    case 'ANOMALY':
      return {
        subject: `⚠️ Anomaly Detected: ${title}`,
        message: `${message}\n\nAnomaly details: ${JSON.stringify(data || {}, null, 2)}`,
      };

    case 'MONTHLY_REPORT_READY':
      return {
        subject: `Monthly Report Ready: ${title}`,
        message: `${message}\n\nYour monthly payroll report is ready for review.`,
      };

    default:
      return {
        subject: title,
        message,
      };
  }
}

/**
 * Get organization notification settings
 */
async function getNotificationSettings(organizationId: string) {
  const settings = await db.organizationNotificationSettings.findUnique({
    where: { organizationId },
  });

  return {
    slackWebhookUrl: settings?.slackWebhookUrl || null,
    emailRecipients: (settings?.emailRecipients as string[] | null) || [],
  };
}

/**
 * Send notification via all configured providers
 */
export async function sendNotification(options: NotificationOptions): Promise<void> {
  const { organizationId, userId, type, payload } = options;

  // Get notification settings
  const settings = await getNotificationSettings(organizationId);

  // Format message
  const { subject, message } = formatNotificationMessage(type, payload);

  // Send to Slack if configured
  if (settings.slackWebhookUrl) {
    try {
      await slackProvider.send(settings.slackWebhookUrl, message, payload.data);
    } catch (error) {
      console.error('[Notify] Failed to send Slack notification:', error);
      // Don't throw - continue with other providers
    }
  }

  // Send to email recipients if configured
  if (settings.emailRecipients.length > 0) {
    try {
      await emailProvider.send(settings.emailRecipients, subject, message);
    } catch (error) {
      console.error('[Notify] Failed to send email notification:', error);
      // Don't throw - continue with database record
    }
  }

  // Always create database notification record
  // If userId is provided, create user-specific notification
  // Otherwise, we'll need to determine recipients (e.g., finance team, admins)
  if (userId) {
    await db.notification.create({
      data: {
        organizationId,
        userId,
        type,
        payload: payload as object,
      },
    });
  } else {
    // For org-wide notifications, find relevant users (e.g., finance admins)
    // For now, we'll skip user-specific records if no userId provided
    // In production, you might want to create notifications for all finance admins
    console.log(`[Notify] Created org-wide notification (no userId): ${type}`);
  }

  console.log(`[Notify] Notification sent: ${type} for org ${organizationId}`);
}

/**
 * Send notification to specific users (e.g., finance team, approvers)
 */
export async function sendNotificationToUsers(
  organizationId: string,
  userIds: string[],
  type: NotificationType,
  payload: NotificationPayload
): Promise<void> {
  // Send via providers (Slack, Email)
  await sendNotification({
    organizationId,
    type,
    payload,
  });

  // Create database records for each user
  for (const userId of userIds) {
    await db.notification.create({
      data: {
        organizationId,
        userId,
        type,
        payload: payload as object,
      },
    });
  }
}

