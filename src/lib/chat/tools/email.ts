/**
 * Email Chat Tools
 * Enables users to manage Gmail through the chat interface
 */

import { z } from 'zod';
import { google } from 'googleapis';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { GmailService } from '@/lib/google/gmail';

const LOG_PREFIX = '[Email Tools]';

/**
 * Initialize OAuth2 client with user's tokens for Gmail access
 */
async function getGmailClient(userId: string): Promise<GmailService> {
  const tokens = await getGoogleTokens(userId);
  if (!tokens) {
    throw new Error('No Google tokens found for user');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
      : 'http://localhost:3300/api/auth/callback/google'
  );

  oauth2Client.setCredentials({
    access_token: tokens.accessToken || undefined,
    refresh_token: tokens.refreshToken || undefined,
    expiry_date: tokens.accessTokenExpiresAt
      ? new Date(tokens.accessTokenExpiresAt).getTime()
      : undefined,
  });

  // Auto-refresh tokens if needed
  oauth2Client.on('tokens', async (newTokens) => {
    console.log(`${LOG_PREFIX} Tokens refreshed for user:`, userId);
    await updateGoogleTokens(userId, newTokens);
  });

  return new GmailService(oauth2Client);
}

/**
 * Archive Email Tool
 * Archives an email by removing it from the inbox
 */
export const archiveEmailToolSchema = z.object({
  searchQuery: z
    .string()
    .describe(
      'Gmail search query to find the email (e.g., "from:john@example.com subject:meeting" or "subject:newsletter")'
    ),
});

export type ArchiveEmailParams = z.infer<typeof archiveEmailToolSchema>;

export const archiveEmailTool = {
  name: 'archive_email',
  description:
    'Archive an email by searching for it. Use Gmail search syntax like "from:sender@example.com", "subject:meeting notes", or combine them. The email will be removed from inbox but kept in All Mail.',
  parameters: archiveEmailToolSchema,

  async execute(
    params: ArchiveEmailParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = archiveEmailToolSchema.parse(params);
      const gmailService = await getGmailClient(userId);

      // Search for matching emails
      const emails = await gmailService.searchEmails(
        `in:inbox ${validated.searchQuery}`,
        5
      );

      if (emails.length === 0) {
        return {
          message: `No emails found matching "${validated.searchQuery}" in your inbox.`,
        };
      }

      if (emails.length === 1) {
        // Archive the single email
        const email = emails[0];
        await gmailService.archiveEmail(email.id);
        return {
          message: `Archived email: "${email.subject}" from ${email.from.name || email.from.email}`,
        };
      }

      // Multiple matches - ask for confirmation
      const emailList = emails
        .map(
          (e, i) =>
            `${i + 1}. "${e.subject}" from ${e.from.name || e.from.email} (${e.date.toLocaleDateString()})`
        )
        .join('\n');

      return {
        message: `Found ${emails.length} emails matching your search:\n\n${emailList}\n\nPlease be more specific, or say "archive all ${emails.length} emails" to archive them all.`,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Archive email failed:`, error);
      throw new Error(
        `Failed to archive email: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Delete Email Tool
 * Moves an email to trash
 */
export const deleteEmailToolSchema = z.object({
  searchQuery: z
    .string()
    .describe('Gmail search query to find the email to delete'),
  confirmed: z
    .boolean()
    .optional()
    .describe('Whether the user has confirmed the deletion'),
});

export type DeleteEmailParams = z.infer<typeof deleteEmailToolSchema>;

export const deleteEmailTool = {
  name: 'delete_email',
  description:
    'Move an email to trash. Requires confirmation before deletion. Use Gmail search syntax to find the email.',
  parameters: deleteEmailToolSchema,

  async execute(
    params: DeleteEmailParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = deleteEmailToolSchema.parse(params);
      const gmailService = await getGmailClient(userId);

      // Search for matching emails
      const emails = await gmailService.searchEmails(validated.searchQuery, 5);

      if (emails.length === 0) {
        return {
          message: `No emails found matching "${validated.searchQuery}".`,
        };
      }

      if (emails.length === 1) {
        const email = emails[0];

        if (!validated.confirmed) {
          return {
            message: `**Confirm deletion:**\n\nEmail: "${email.subject}"\nFrom: ${email.from.name || email.from.email}\nDate: ${email.date.toLocaleDateString()}\n\nPlease confirm you want to move this email to trash.`,
          };
        }

        await gmailService.trashEmail(email.id);
        return {
          message: `Moved to trash: "${email.subject}" from ${email.from.name || email.from.email}`,
        };
      }

      // Multiple matches
      const emailList = emails
        .map(
          (e, i) =>
            `${i + 1}. "${e.subject}" from ${e.from.name || e.from.email} (${e.date.toLocaleDateString()})`
        )
        .join('\n');

      return {
        message: `Found ${emails.length} emails matching your search:\n\n${emailList}\n\nPlease be more specific about which email to delete.`,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Delete email failed:`, error);
      throw new Error(
        `Failed to delete email: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Apply Label Tool
 * Adds a label to an email
 */
export const applyLabelToolSchema = z.object({
  searchQuery: z
    .string()
    .describe('Gmail search query to find the email'),
  labelName: z
    .string()
    .describe('Name of the label to apply (e.g., "Work", "Important")'),
});

export type ApplyLabelParams = z.infer<typeof applyLabelToolSchema>;

export const applyLabelTool = {
  name: 'apply_label',
  description:
    'Add a Gmail label to an email. Labels help organize emails into categories.',
  parameters: applyLabelToolSchema,

  async execute(
    params: ApplyLabelParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = applyLabelToolSchema.parse(params);
      const gmailService = await getGmailClient(userId);

      // Find the label
      const label = await gmailService.findLabelByName(validated.labelName);
      if (!label) {
        const labels = await gmailService.getLabels();
        const userLabels = labels
          .filter((l) => l.type === 'user')
          .map((l) => l.name)
          .join(', ');
        return {
          message: `Label "${validated.labelName}" not found. Available labels: ${userLabels || 'None'}`,
        };
      }

      // Search for matching emails
      const emails = await gmailService.searchEmails(validated.searchQuery, 5);

      if (emails.length === 0) {
        return {
          message: `No emails found matching "${validated.searchQuery}".`,
        };
      }

      if (emails.length === 1) {
        const email = emails[0];
        await gmailService.applyLabel(email.id, label.id);
        return {
          message: `Applied label "${label.name}" to: "${email.subject}"`,
        };
      }

      // Multiple matches
      const emailList = emails
        .map(
          (e, i) =>
            `${i + 1}. "${e.subject}" from ${e.from.name || e.from.email}`
        )
        .join('\n');

      return {
        message: `Found ${emails.length} emails matching your search:\n\n${emailList}\n\nPlease be more specific about which email to label.`,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Apply label failed:`, error);
      throw new Error(
        `Failed to apply label: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * List Labels Tool
 * Shows available Gmail labels
 */
export const listLabelsToolSchema = z.object({});

export type ListLabelsParams = z.infer<typeof listLabelsToolSchema>;

export const listLabelsTool = {
  name: 'list_labels',
  description:
    'List all Gmail labels (folders) in your mailbox. Shows both system labels and custom labels.',
  parameters: listLabelsToolSchema,

  async execute(
    _params: ListLabelsParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const gmailService = await getGmailClient(userId);
      const labels = await gmailService.getLabels();

      const systemLabels = labels
        .filter((l) => l.type === 'system')
        .map((l) => l.name)
        .sort();

      const userLabels = labels
        .filter((l) => l.type === 'user')
        .map((l) => l.name)
        .sort();

      let message = '**Gmail Labels:**\n\n';

      if (userLabels.length > 0) {
        message += '**Your Labels:**\n';
        message += userLabels.map((l) => `- ${l}`).join('\n');
        message += '\n\n';
      }

      message += '**System Labels:**\n';
      message += systemLabels.map((l) => `- ${l}`).join('\n');

      return { message };
    } catch (error) {
      console.error(`${LOG_PREFIX} List labels failed:`, error);
      throw new Error(
        `Failed to list labels: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Send Email Tool
 * Sends an email (requires confirmation)
 */
export const sendEmailToolSchema = z.object({
  to: z.string().describe('Recipient email address'),
  subject: z.string().describe('Email subject line'),
  body: z.string().describe('Email body content (plain text)'),
  cc: z.string().optional().describe('CC recipients (comma-separated)'),
  confirmed: z
    .boolean()
    .optional()
    .describe('Whether the user has confirmed sending'),
});

export type SendEmailParams = z.infer<typeof sendEmailToolSchema>;

export const sendEmailTool = {
  name: 'send_email',
  description:
    'Send an email. Requires user confirmation before sending. Provide recipient, subject, and body.',
  parameters: sendEmailToolSchema,

  async execute(
    params: SendEmailParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = sendEmailToolSchema.parse(params);

      if (!validated.confirmed) {
        // Show preview and ask for confirmation
        let preview = `**Please confirm you want to send this email:**\n\n`;
        preview += `**To:** ${validated.to}\n`;
        if (validated.cc) {
          preview += `**CC:** ${validated.cc}\n`;
        }
        preview += `**Subject:** ${validated.subject}\n\n`;
        preview += `**Message:**\n${validated.body}\n\n`;
        preview += `Say "yes, send it" or "confirm" to send this email.`;

        return { message: preview };
      }

      const gmailService = await getGmailClient(userId);

      await gmailService.sendEmail(validated.to, validated.subject, validated.body, {
        cc: validated.cc,
      });

      return {
        message: `Email sent successfully to ${validated.to}!\n\nSubject: "${validated.subject}"`,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Send email failed:`, error);
      throw new Error(
        `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Bulk Archive Tool
 * Archives multiple emails matching criteria
 */
export const bulkArchiveToolSchema = z.object({
  searchQuery: z
    .string()
    .describe(
      'Gmail search query to find emails to archive (e.g., "from:newsletter@example.com older_than:30d")'
    ),
  maxEmails: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(20)
    .describe('Maximum number of emails to archive (1-50)'),
  confirmed: z
    .boolean()
    .optional()
    .describe('Whether the user has confirmed the bulk operation'),
});

export type BulkArchiveParams = z.infer<typeof bulkArchiveToolSchema>;

export const bulkArchiveTool = {
  name: 'bulk_archive',
  description:
    'Archive multiple emails matching a search query. Great for cleaning up newsletters, promotional emails, or old messages. Requires confirmation. Use Gmail search syntax like "from:sender older_than:30d" or "category:promotions older_than:7d".',
  parameters: bulkArchiveToolSchema,

  async execute(
    params: BulkArchiveParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = bulkArchiveToolSchema.parse(params);
      const gmailService = await getGmailClient(userId);

      // Search for matching emails
      const emails = await gmailService.searchEmails(
        `in:inbox ${validated.searchQuery}`,
        validated.maxEmails
      );

      if (emails.length === 0) {
        return {
          message: `No emails found matching "${validated.searchQuery}" in your inbox.`,
        };
      }

      if (!validated.confirmed) {
        // Show summary and ask for confirmation
        const senderCounts: Record<string, number> = {};
        for (const email of emails) {
          const sender = email.from.name || email.from.email;
          senderCounts[sender] = (senderCounts[sender] || 0) + 1;
        }

        const topSenders = Object.entries(senderCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([sender, count]) => `- ${sender}: ${count} emails`)
          .join('\n');

        const oldestDate = new Date(
          Math.min(...emails.map((e) => e.date.getTime()))
        ).toLocaleDateString();
        const newestDate = new Date(
          Math.max(...emails.map((e) => e.date.getTime()))
        ).toLocaleDateString();

        let message = `**Confirm bulk archive:**\n\n`;
        message += `Found **${emails.length}** emails matching "${validated.searchQuery}"\n\n`;
        message += `**Date range:** ${oldestDate} - ${newestDate}\n\n`;
        message += `**Top senders:**\n${topSenders}\n\n`;
        message += `Say "yes, archive them" to proceed with archiving all ${emails.length} emails.`;

        return { message };
      }

      // Perform bulk archive
      const result = await gmailService.batchArchive(emails.map((e) => e.id));

      return {
        message: `Bulk archive complete!\n\n- Archived: ${result.success} emails\n- Failed: ${result.failed} emails`,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Bulk archive failed:`, error);
      throw new Error(
        `Failed to bulk archive: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Create Draft Tool
 * Creates an email draft
 */
export const createDraftToolSchema = z.object({
  to: z.string().describe('Recipient email address'),
  subject: z.string().describe('Email subject line'),
  body: z.string().describe('Email body content (plain text)'),
  cc: z.string().optional().describe('CC recipients (comma-separated)'),
});

export type CreateDraftParams = z.infer<typeof createDraftToolSchema>;

export const createDraftTool = {
  name: 'create_draft',
  description:
    'Create an email draft without sending it. The draft will be saved in your Gmail Drafts folder for later editing or sending.',
  parameters: createDraftToolSchema,

  async execute(
    params: CreateDraftParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = createDraftToolSchema.parse(params);
      const gmailService = await getGmailClient(userId);

      await gmailService.createDraft(
        validated.to,
        validated.subject,
        validated.body,
        { cc: validated.cc }
      );

      return {
        message: `Draft created!\n\n**To:** ${validated.to}\n**Subject:** ${validated.subject}\n\nYou can find and edit this draft in Gmail.`,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Create draft failed:`, error);
      throw new Error(
        `Failed to create draft: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};
