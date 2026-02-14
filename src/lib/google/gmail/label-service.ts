/**
 * Gmail Label Service
 * Handles label and folder operations
 */

import type { gmail_v1 } from 'googleapis';
import type { GmailLabel } from '../types';
import type { IGmailLabelService } from './interfaces';

export class GmailLabelService implements IGmailLabelService {
  constructor(private gmail: gmail_v1.Gmail) {}

  /**
   * Get available labels
   */
  async getLabels(): Promise<GmailLabel[]> {
    try {
      const response = await this.gmail.users.labels.list({
        userId: 'me',
      });

      return (response.data.labels || []).map((label) => ({
        id: label.id || '',
        name: label.name || '',
        type: label.type === 'system' ? 'system' : 'user',
        messageListVisibility: label.messageListVisibility || null,
        labelListVisibility: label.labelListVisibility || null,
      }));
    } catch (error) {
      console.error('[Gmail] Failed to get labels:', error);
      throw new Error(`Failed to get labels: ${error}`);
    }
  }

  /**
   * Find label by name (case-insensitive)
   */
  async findLabelByName(labelName: string): Promise<GmailLabel | null> {
    const labels = await this.getLabels();
    return labels.find((label) => label.name.toLowerCase() === labelName.toLowerCase()) || null;
  }

  /**
   * Create a new Gmail label
   */
  async createLabel(labelName: string): Promise<GmailLabel> {
    try {
      const response = await this.gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name: labelName,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });

      const label = response.data;
      return {
        id: label.id || '',
        name: label.name || '',
        type: label.type === 'system' ? 'system' : 'user',
        messageListVisibility: label.messageListVisibility || null,
        labelListVisibility: label.labelListVisibility || null,
      };
    } catch (error) {
      console.error(`[Gmail] Failed to create label "${labelName}":`, error);
      throw new Error(`Failed to create label: ${error}`);
    }
  }

  /**
   * Get a label by name, or create it if it doesn't exist
   */
  async getOrCreateLabel(labelName: string): Promise<GmailLabel> {
    const existingLabel = await this.findLabelByName(labelName);
    if (existingLabel) {
      return existingLabel;
    }
    return this.createLabel(labelName);
  }

  /**
   * Apply a label to an email
   */
  async applyLabel(id: string, labelId: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id,
        requestBody: {
          addLabelIds: [labelId],
        },
      });
    } catch (error) {
      console.error(`[Gmail] Failed to apply label to email ${id}:`, error);
      throw new Error(`Failed to apply label: ${error}`);
    }
  }

  /**
   * Remove a label from an email
   */
  async removeLabel(id: string, labelId: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id,
        requestBody: {
          removeLabelIds: [labelId],
        },
      });
    } catch (error) {
      console.error(`[Gmail] Failed to remove label from email ${id}:`, error);
      throw new Error(`Failed to remove label: ${error}`);
    }
  }

  /**
   * Archive an email (remove from INBOX)
   */
  async archiveEmail(id: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id,
        requestBody: {
          removeLabelIds: ['INBOX'],
        },
      });
    } catch (error) {
      console.error(`[Gmail] Failed to archive email ${id}:`, error);
      throw new Error(`Failed to archive email: ${error}`);
    }
  }

  /**
   * Move an email to trash
   */
  async trashEmail(id: string): Promise<void> {
    try {
      await this.gmail.users.messages.trash({
        userId: 'me',
        id,
      });
    } catch (error) {
      console.error(`[Gmail] Failed to trash email ${id}:`, error);
      throw new Error(`Failed to trash email: ${error}`);
    }
  }

  /**
   * Move email to a folder/label (removes from INBOX, adds target label)
   */
  async moveToFolder(id: string, labelId: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id,
        requestBody: {
          addLabelIds: [labelId],
          removeLabelIds: ['INBOX'],
        },
      });
    } catch (error) {
      console.error(`[Gmail] Failed to move email ${id}:`, error);
      throw new Error(`Failed to move email: ${error}`);
    }
  }

  /**
   * Move an email to a folder/label by name
   * Resolves label name to ID and moves the email
   */
  async moveEmail(
    id: string,
    targetLabelName: string,
    removeFromInbox: boolean = true
  ): Promise<void> {
    try {
      const label = await this.findLabelByName(targetLabelName);
      if (!label) {
        throw new Error(`Label "${targetLabelName}" not found`);
      }

      const removeLabelIds = removeFromInbox ? ['INBOX'] : [];

      await this.gmail.users.messages.modify({
        userId: 'me',
        id,
        requestBody: {
          addLabelIds: [label.id],
          removeLabelIds,
        },
      });
    } catch (error) {
      console.error(`[Gmail] Failed to move email ${id}:`, error);
      throw new Error(`Failed to move email: ${error}`);
    }
  }
}
