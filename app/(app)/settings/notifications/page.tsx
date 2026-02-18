'use client';

import { useState, useEffect } from 'react';
import { Save, Bell, Mail, MessageSquare } from 'lucide-react';

export default function NotificationSettingsPage() {
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [emailRecipients, setEmailRecipients] = useState<string[]>(['']);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/notifications/settings');
      if (!response.ok) {
        throw new Error('Failed to load settings');
      }
      const data = await response.json();
      setSlackWebhookUrl(data.slackWebhookUrl || '');
      setEmailRecipients(
        data.emailRecipients && data.emailRecipients.length > 0
          ? data.emailRecipients
          : ['']
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // Filter out empty email recipients
      const validEmails = emailRecipients.filter((email) => email.trim() !== '');

      const response = await fetch('/api/notifications/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slackWebhookUrl: slackWebhookUrl.trim() || null,
          emailRecipients: validEmails,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save settings');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const addEmailRecipient = () => {
    setEmailRecipients([...emailRecipients, '']);
  };

  const removeEmailRecipient = (index: number) => {
    setEmailRecipients(emailRecipients.filter((_, i) => i !== index));
  };

  const updateEmailRecipient = (index: number, value: string) => {
    const updated = [...emailRecipients];
    updated[index] = value;
    setEmailRecipients(updated);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Notification Settings</h1>
        <p className="mt-2 text-gray-600">
          Configure how you receive notifications for payroll events and alerts.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 p-4">
          <p className="text-sm text-green-800">Settings saved successfully!</p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
        {/* Slack Configuration */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-purple-600" />
            <h2 className="text-xl font-semibold text-gray-900">Slack Notifications</h2>
          </div>
          <p className="text-sm text-gray-600">
            Receive notifications in your Slack workspace via incoming webhooks.
          </p>
          <div>
            <label
              htmlFor="slack-webhook"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Slack Webhook URL
            </label>
            <input
              id="slack-webhook"
              type="url"
              value={slackWebhookUrl}
              onChange={(e) => setSlackWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-purple-500 sm:text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Create an incoming webhook in your Slack workspace to receive notifications.
            </p>
          </div>
        </div>

        <div className="border-t border-gray-200"></div>

        {/* Email Configuration */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Email Notifications</h2>
          </div>
          <p className="text-sm text-gray-600">
            Send notifications to email addresses (e.g., finance@company.com, audit@company.com).
          </p>
          <div className="space-y-3">
            {emailRecipients.map((email, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => updateEmailRecipient(index, e.target.value)}
                  placeholder="finance@company.com"
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                />
                {emailRecipients.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeEmailRecipient(index)}
                    className="px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 rounded-md border border-red-200"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addEmailRecipient}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              + Add Email Recipient
            </button>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Notification Types Info */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="h-5 w-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Notification Types</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium text-gray-900 mb-2">Approval & Workflow</p>
            <ul className="space-y-1 text-gray-600">
              <li>• Approval Required</li>
              <li>• Approval Response</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-gray-900 mb-2">Stream Events</p>
            <ul className="space-y-1 text-gray-600">
              <li>• Stream Created</li>
              <li>• Stream Paused</li>
              <li>• Stream Updated</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-gray-900 mb-2">Alerts</p>
            <ul className="space-y-1 text-gray-600">
              <li>• Anomaly Detected</li>
              <li>• Budget Warning</li>
              <li>• System Alert</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-gray-900 mb-2">Reports</p>
            <ul className="space-y-1 text-gray-600">
              <li>• Monthly Report Ready</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

