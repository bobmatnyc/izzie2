/**
 * Proxy Email Send API (Example)
 * POST /api/proxy/send-email - Send email on behalf of user
 * Requires proxy authorization
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProxyAuthorization } from '@/lib/proxy/middleware';
import type { ProxyContext } from '@/lib/proxy/middleware';

/**
 * Handler function for sending email
 * This is wrapped by withProxyAuthorization middleware
 */
const handler = async (
  request: NextRequest,
  context: ProxyContext
): Promise<NextResponse> => {
  const body = await request.json();

  // Validate email parameters
  if (!body.to || !body.subject || !body.body) {
    return NextResponse.json(
      {
        success: false,
        error: 'Missing required fields: to, subject, body',
      },
      { status: 400 }
    );
  }

  // TODO: Implement actual email sending logic
  // This is a placeholder that would integrate with your Gmail service
  // Example:
  // const result = await sendEmail(context.userId, {
  //   to: body.to,
  //   subject: body.subject,
  //   body: body.body,
  //   cc: body.cc,
  //   bcc: body.bcc,
  // });

  console.log('[Proxy Email] Sending email for user:', context.userId);
  console.log('[Proxy Email] To:', body.to);
  console.log('[Proxy Email] Subject:', body.subject);

  // Mock response (replace with actual email sending)
  const result = {
    id: 'mock-email-id',
    to: body.to,
    subject: body.subject,
    sentAt: new Date().toISOString(),
  };

  return NextResponse.json({
    success: true,
    data: result,
    message: 'Email sent successfully',
  });
};

/**
 * POST /api/proxy/send-email
 * Protected by proxy authorization middleware
 *
 * Request Body:
 * - to: string (required) - Recipient email
 * - subject: string (required) - Email subject
 * - body: string (required) - Email body
 * - cc: string[] (optional) - CC recipients
 * - bcc: string[] (optional) - BCC recipients
 *
 * Query Parameters:
 * - confirmed: 'true' (required if action needs confirmation)
 */
export const POST = withProxyAuthorization(handler, {
  actionClass: 'send_email',
  confidence: 0.95, // High confidence required for sending emails
  requiresConfirmation: true, // Require user confirmation
});
