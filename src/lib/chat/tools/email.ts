/**
 * Email Chat Tools
 * Enables users to manage Gmail through the chat interface
 */

import { z } from 'zod';
import { google } from 'googleapis';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { requireGmailModifyAccess, requireGmailSendAccess, requireGmailSettingsAccess } from '@/lib/auth/scopes';
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
      // Check for Gmail modify access before any modify operation
      await requireGmailModifyAccess(userId);

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
      // Check for Gmail modify access before any modify operation
      await requireGmailModifyAccess(userId);

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
      // Check for Gmail modify access before any modify operation
      await requireGmailModifyAccess(userId);

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
      // Check for Gmail send access before any send operation
      await requireGmailSendAccess(userId);

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
      // Check for Gmail modify access before any modify operation
      await requireGmailModifyAccess(userId);

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
      // Check for Gmail send access before any draft operation
      await requireGmailSendAccess(userId);

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

/**
 * Move Email Tool
 * Moves an email to a specific label/folder
 */
export const moveEmailToolSchema = z.object({
  searchQuery: z
    .string()
    .describe('Gmail search query to find the email to move'),
  targetLabel: z
    .string()
    .describe('Name of the label/folder to move the email to (e.g., "Work", "Important")'),
  keepInInbox: z
    .boolean()
    .optional()
    .default(false)
    .describe('If true, keeps the email in inbox (adds label only). If false, removes from inbox.'),
});

export type MoveEmailParams = z.infer<typeof moveEmailToolSchema>;

export const moveEmailTool = {
  name: 'move_email',
  description:
    'Move an email to a specific label/folder. By default removes from inbox. Use Gmail search syntax to find the email.',
  parameters: moveEmailToolSchema,

  async execute(
    params: MoveEmailParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      // Check for Gmail modify access before any modify operation
      await requireGmailModifyAccess(userId);

      const validated = moveEmailToolSchema.parse(params);
      const gmailService = await getGmailClient(userId);

      // First verify the label exists
      const label = await gmailService.findLabelByName(validated.targetLabel);
      if (!label) {
        const labels = await gmailService.getLabels();
        const userLabels = labels
          .filter((l) => l.type === 'user')
          .map((l) => l.name)
          .join(', ');
        return {
          message: `Label "${validated.targetLabel}" not found. Available labels: ${userLabels || 'None'}`,
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
        await gmailService.moveEmail(email.id, validated.targetLabel, !validated.keepInInbox);
        const action = validated.keepInInbox ? 'Added label' : 'Moved';
        return {
          message: `${action} "${email.subject}" to ${label.name}`,
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
        message: `Found ${emails.length} emails matching your search:\n\n${emailList}\n\nPlease be more specific about which email to move.`,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Move email failed:`, error);
      throw new Error(
        `Failed to move email: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Create Email Filter Tool
 * Creates a Gmail filter to automatically process incoming emails
 */
export const createEmailFilterToolSchema = z.object({
  from: z.string().optional().describe('Filter emails from this sender address'),
  to: z.string().optional().describe('Filter emails sent to this address'),
  subject: z.string().optional().describe('Filter emails with this subject (exact match)'),
  query: z.string().optional().describe('Additional Gmail search query for complex filtering'),
  hasAttachment: z.boolean().optional().describe('Only match emails with attachments'),
  applyLabel: z.string().optional().describe('Label to apply to matching emails'),
  archive: z.boolean().optional().default(false).describe('Archive matching emails (remove from inbox)'),
  markRead: z.boolean().optional().default(false).describe('Mark matching emails as read'),
  star: z.boolean().optional().default(false).describe('Star matching emails'),
  forward: z.string().optional().describe('Forward matching emails to this address'),
});

export type CreateEmailFilterParams = z.infer<typeof createEmailFilterToolSchema>;

export const createEmailFilterTool = {
  name: 'create_email_filter',
  description:
    'Create a Gmail filter to automatically process incoming emails. Filters can apply labels, archive, mark as read, star, or forward emails based on sender, recipient, subject, or other criteria.',
  parameters: createEmailFilterToolSchema,

  async execute(
    params: CreateEmailFilterParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      // Check for Gmail settings access before creating filters
      await requireGmailSettingsAccess(userId);

      const validated = createEmailFilterToolSchema.parse(params);
      const gmailService = await getGmailClient(userId);

      // At least one criteria must be specified
      if (!validated.from && !validated.to && !validated.subject && !validated.query && !validated.hasAttachment) {
        return {
          message: 'Please specify at least one filter criteria: from, to, subject, query, or hasAttachment.',
        };
      }

      // At least one action must be specified
      if (!validated.applyLabel && !validated.archive && !validated.markRead && !validated.star && !validated.forward) {
        return {
          message: 'Please specify at least one filter action: applyLabel, archive, markRead, star, or forward.',
        };
      }

      // Build criteria
      const criteria: Record<string, unknown> = {};
      if (validated.from) criteria.from = validated.from;
      if (validated.to) criteria.to = validated.to;
      if (validated.subject) criteria.subject = validated.subject;
      if (validated.query) criteria.query = validated.query;
      if (validated.hasAttachment) criteria.hasAttachment = validated.hasAttachment;

      // Build action
      const addLabelIds: string[] = [];
      const removeLabelIds: string[] = [];

      // Resolve label name to ID if specified (auto-create if doesn't exist)
      if (validated.applyLabel) {
        const label = await gmailService.getOrCreateLabel(validated.applyLabel);
        addLabelIds.push(label.id);
      }

      if (validated.archive) {
        removeLabelIds.push('INBOX');
      }

      if (validated.markRead) {
        removeLabelIds.push('UNREAD');
      }

      if (validated.star) {
        addLabelIds.push('STARRED');
      }

      const action: Record<string, unknown> = {};
      if (addLabelIds.length > 0) action.addLabelIds = addLabelIds;
      if (removeLabelIds.length > 0) action.removeLabelIds = removeLabelIds;
      if (validated.forward) action.forward = validated.forward;

      // Create the filter
      const filter = await gmailService.createFilter(criteria, action);

      // Build confirmation message
      const criteriaDesc: string[] = [];
      if (validated.from) criteriaDesc.push(`from: ${validated.from}`);
      if (validated.to) criteriaDesc.push(`to: ${validated.to}`);
      if (validated.subject) criteriaDesc.push(`subject: "${validated.subject}"`);
      if (validated.query) criteriaDesc.push(`query: ${validated.query}`);
      if (validated.hasAttachment) criteriaDesc.push('has attachment');

      const actionDesc: string[] = [];
      if (validated.applyLabel) actionDesc.push(`apply label "${validated.applyLabel}"`);
      if (validated.archive) actionDesc.push('archive');
      if (validated.markRead) actionDesc.push('mark as read');
      if (validated.star) actionDesc.push('star');
      if (validated.forward) actionDesc.push(`forward to ${validated.forward}`);

      return {
        message: `Filter created successfully!\n\n**Criteria:** ${criteriaDesc.join(', ')}\n**Actions:** ${actionDesc.join(', ')}\n\n*Filter ID: ${filter.id}*`,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Create filter failed:`, error);
      throw new Error(
        `Failed to create filter: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * List Email Filters Tool
 * Lists all Gmail filters
 */
export const listEmailFiltersToolSchema = z.object({});

export type ListEmailFiltersParams = z.infer<typeof listEmailFiltersToolSchema>;

export const listEmailFiltersTool = {
  name: 'list_email_filters',
  description:
    'List all Gmail filters configured for your account. Shows filter criteria and actions.',
  parameters: listEmailFiltersToolSchema,

  async execute(
    _params: ListEmailFiltersParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const gmailService = await getGmailClient(userId);
      const filters = await gmailService.listFilters();

      if (filters.length === 0) {
        return {
          message: 'No email filters configured. Use create_email_filter to set up automatic email processing.',
        };
      }

      // Get all labels for resolving IDs to names
      const labels = await gmailService.getLabels();
      const labelMap = new Map(labels.map((l) => [l.id, l.name]));

      const filterDescriptions = filters.map((filter, index) => {
        // Build criteria description
        const criteriaDesc: string[] = [];
        if (filter.criteria.from) criteriaDesc.push(`from: ${filter.criteria.from}`);
        if (filter.criteria.to) criteriaDesc.push(`to: ${filter.criteria.to}`);
        if (filter.criteria.subject) criteriaDesc.push(`subject: "${filter.criteria.subject}"`);
        if (filter.criteria.query) criteriaDesc.push(`query: ${filter.criteria.query}`);
        if (filter.criteria.hasAttachment) criteriaDesc.push('has attachment');

        // Build action description
        const actionDesc: string[] = [];
        if (filter.action.addLabelIds) {
          const labelNames = filter.action.addLabelIds
            .map((id) => labelMap.get(id) || id)
            .filter((name) => name !== 'STARRED');
          if (labelNames.length > 0) actionDesc.push(`apply: ${labelNames.join(', ')}`);
          if (filter.action.addLabelIds.includes('STARRED')) actionDesc.push('star');
        }
        if (filter.action.removeLabelIds) {
          if (filter.action.removeLabelIds.includes('INBOX')) actionDesc.push('archive');
          if (filter.action.removeLabelIds.includes('UNREAD')) actionDesc.push('mark read');
        }
        if (filter.action.forward) actionDesc.push(`forward to: ${filter.action.forward}`);

        return `**${index + 1}.** ${criteriaDesc.join(', ') || 'No criteria'}\n   Actions: ${actionDesc.join(', ') || 'No actions'}\n   *ID: ${filter.id}*`;
      });

      return {
        message: `**Gmail Filters (${filters.length}):**\n\n${filterDescriptions.join('\n\n')}`,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} List filters failed:`, error);
      throw new Error(
        `Failed to list filters: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Delete Email Filter Tool
 * Deletes a Gmail filter by ID
 */
export const deleteEmailFilterToolSchema = z.object({
  filterId: z.string().describe('The ID of the filter to delete (use list_email_filters to find IDs)'),
  confirmed: z.boolean().optional().describe('Whether the user has confirmed the deletion'),
});

export type DeleteEmailFilterParams = z.infer<typeof deleteEmailFilterToolSchema>;

export const deleteEmailFilterTool = {
  name: 'delete_email_filter',
  description:
    'Delete a Gmail filter by its ID. Use list_email_filters first to find the filter ID.',
  parameters: deleteEmailFilterToolSchema,

  async execute(
    params: DeleteEmailFilterParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      // Check for Gmail settings access before deleting filters
      await requireGmailSettingsAccess(userId);

      const validated = deleteEmailFilterToolSchema.parse(params);
      const gmailService = await getGmailClient(userId);

      // First get the filter to show details
      let filter;
      try {
        filter = await gmailService.getFilter(validated.filterId);
      } catch {
        return {
          message: `Filter with ID "${validated.filterId}" not found. Use list_email_filters to see available filters.`,
        };
      }

      if (!validated.confirmed) {
        // Build criteria description
        const criteriaDesc: string[] = [];
        if (filter.criteria.from) criteriaDesc.push(`from: ${filter.criteria.from}`);
        if (filter.criteria.to) criteriaDesc.push(`to: ${filter.criteria.to}`);
        if (filter.criteria.subject) criteriaDesc.push(`subject: "${filter.criteria.subject}"`);
        if (filter.criteria.query) criteriaDesc.push(`query: ${filter.criteria.query}`);

        return {
          message: `**Confirm filter deletion:**\n\nFilter: ${criteriaDesc.join(', ') || 'No criteria'}\nID: ${filter.id}\n\nPlease confirm you want to delete this filter.`,
        };
      }

      await gmailService.deleteFilter(validated.filterId);

      return {
        message: `Filter deleted successfully.\n\n*Deleted filter ID: ${validated.filterId}*`,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Delete filter failed:`, error);
      throw new Error(
        `Failed to delete filter: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};
