/**
 * Email Scoring Test API
 *
 * GET /api/scoring/test - Test scoring with sample data
 */

import { NextRequest, NextResponse } from 'next/server';
import { EmailScorer, ContactAnalyzer } from '@/lib/scoring';
import type { Email } from '@/lib/google/types';

// Generate sample test data
function generateSampleEmails(): Email[] {
  const baseDate = new Date('2024-01-01');
  const userEmail = 'test@example.com';

  const contacts = [
    { email: 'alice@example.com', name: 'Alice Johnson' },
    { email: 'bob@example.com', name: 'Bob Smith' },
    { email: 'charlie@example.com', name: 'Charlie Brown' },
    { email: 'diana@example.com', name: 'Diana Prince' },
    { email: 'eve@example.com', name: 'Eve Wilson' },
  ];

  const emails: Email[] = [];
  let idCounter = 1;

  // Generate sent emails (high signal)
  for (let i = 0; i < 15; i++) {
    const contact = contacts[i % contacts.length];
    const threadId = `thread-sent-${Math.floor(i / 3)}`;

    emails.push({
      id: `email-${idCounter++}`,
      threadId,
      from: { email: userEmail, name: 'Test User' },
      to: [contact],
      subject: i % 3 === 0 ? 'Project update' : `Re: Meeting notes ${i}`,
      body: `This is a sent email to ${contact.name}. Important project discussion.`,
      date: new Date(baseDate.getTime() + i * 86400000),
      labels: ['SENT', ...(i % 4 === 0 ? ['IMPORTANT'] : [])],
      isSent: true,
      hasAttachments: i % 5 === 0,
      internalDate: baseDate.getTime() + i * 86400000,
    });
  }

  // Generate received emails (lower signal)
  for (let i = 0; i < 10; i++) {
    const contact = contacts[i % contacts.length];
    const threadId = `thread-received-${Math.floor(i / 2)}`;

    emails.push({
      id: `email-${idCounter++}`,
      threadId,
      from: contact,
      to: [{ email: userEmail, name: 'Test User' }],
      subject: i % 2 === 0 ? 'Newsletter' : 'Re: Your question',
      body: `This is a received email from ${contact.name}.`,
      date: new Date(baseDate.getTime() + i * 86400000 + 43200000),
      labels: ['INBOX', ...(i % 6 === 0 ? ['STARRED'] : [])],
      isSent: false,
      hasAttachments: i % 7 === 0,
      internalDate: baseDate.getTime() + i * 86400000 + 43200000,
    });
  }

  // Generate some thread depth
  for (let i = 0; i < 5; i++) {
    const threadId = `thread-conversation-${i}`;
    const contact = contacts[i % contacts.length];

    // User initiates
    emails.push({
      id: `email-${idCounter++}`,
      threadId,
      from: { email: userEmail, name: 'Test User' },
      to: [contact],
      subject: `Conversation ${i}`,
      body: 'Initial message',
      date: new Date(baseDate.getTime() + i * 86400000),
      labels: ['SENT'],
      isSent: true,
      hasAttachments: false,
      internalDate: baseDate.getTime() + i * 86400000,
    });

    // Reply back
    emails.push({
      id: `email-${idCounter++}`,
      threadId,
      from: contact,
      to: [{ email: userEmail, name: 'Test User' }],
      subject: `Re: Conversation ${i}`,
      body: 'Reply message',
      date: new Date(baseDate.getTime() + i * 86400000 + 3600000),
      labels: ['INBOX'],
      isSent: false,
      hasAttachments: false,
      internalDate: baseDate.getTime() + i * 86400000 + 3600000,
    });

    // User replies again
    emails.push({
      id: `email-${idCounter++}`,
      threadId,
      from: { email: userEmail, name: 'Test User' },
      to: [contact],
      subject: `Re: Conversation ${i}`,
      body: 'Follow-up message',
      date: new Date(baseDate.getTime() + i * 86400000 + 7200000),
      labels: ['SENT'],
      isSent: true,
      hasAttachments: false,
      internalDate: baseDate.getTime() + i * 86400000 + 7200000,
    });
  }

  return emails;
}

export async function GET(req: NextRequest) {
  try {
    const startTime = Date.now();

    // Generate sample data
    const emails = generateSampleEmails();
    const userEmail = 'test@example.com';

    // Score emails
    const scorer = new EmailScorer();
    const scores = scorer.scoreBatch(emails, userEmail);

    // Analyze contacts
    const analyzer = new ContactAnalyzer();
    const contacts = analyzer.analyzeContacts(emails, userEmail);
    const vips = analyzer.getVIPContacts(emails, userEmail);
    const frequentCorrespondents = analyzer.getFrequentCorrespondents(
      emails,
      userEmail,
      3
    );
    const contactStats = analyzer.getContactStats(emails, userEmail);

    // Get top significant
    const topSignificant = scores
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const duration = Date.now() - startTime;

    // Add sample email details to results
    const topEmails = topSignificant.map((score) => {
      const email = emails.find((e) => e.id === score.emailId);
      return {
        score,
        email: email
          ? {
              id: email.id,
              subject: email.subject,
              from: email.from,
              to: email.to,
              isSent: email.isSent,
              date: email.date,
              labels: email.labels,
            }
          : null,
      };
    });

    return NextResponse.json({
      success: true,
      test: {
        description: 'Sample email scoring test',
        sampleSize: emails.length,
        sentEmailCount: emails.filter((e) => e.isSent).length,
        receivedEmailCount: emails.filter((e) => !e.isSent).length,
      },
      results: {
        totalEmails: emails.length,
        avgScore:
          Math.round(
            (scores.reduce((sum, s) => sum + s.score, 0) / scores.length) * 100
          ) / 100,
        topSignificant: topEmails,
        contacts: contacts.slice(0, 10),
        vips,
        frequentCorrespondents,
        contactStats,
      },
      performance: {
        duration,
        emailsPerSecond: Math.round((emails.length / duration) * 1000),
      },
      validation: {
        sentEmailsHighestScore: topSignificant.every(
          (s) =>
            s.factors.some((f) => f.name === 'isSent') ||
            s.factors.some((f) => f.name === 'isReply')
        ),
        performanceTarget: duration < 5000 ? 'PASS' : 'FAIL',
        expectedBehavior: {
          sentEmails: 'Should have highest baseline scores',
          threadDepth: 'Conversations should score higher',
          frequentContacts: 'Should appear in VIP list',
        },
      },
    });
  } catch (error) {
    console.error('[Scoring Test API] Error:', error);
    return NextResponse.json(
      {
        error: 'Test failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
