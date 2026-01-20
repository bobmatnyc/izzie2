/**
 * Sign-out route handler
 *
 * This dedicated route bypasses an issue with the [...all] catch-all route
 * that causes HTTP 500 errors specifically for the sign-out endpoint.
 *
 * The route clears all authentication cookies to properly sign out the user.
 */

import { dbClient } from '@/lib/db';
import { sessions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';

// Cookie configuration matching auth/index.ts
const COOKIE_PREFIX = 'izzie2';
const SESSION_COOKIE_NAMES = [
  `${COOKIE_PREFIX}.session_token`,
  `${COOKIE_PREFIX}.session_data`,
  `${COOKIE_PREFIX}.dont_remember`,
  `${COOKIE_PREFIX}.account_data`,
];

/**
 * Parse session token from cookie value (handles signed cookies)
 * Better Auth signs cookies using HMAC, format is: value.signature
 */
function parseSessionToken(cookieValue: string): string | null {
  if (!cookieValue) return null;
  // If cookie contains a dot, it might be signed
  const dotIndex = cookieValue.lastIndexOf('.');
  if (dotIndex > 0 && dotIndex < cookieValue.length - 1) {
    // Check if the part after the dot looks like a base64 signature
    const possibleSig = cookieValue.substring(dotIndex + 1);
    if (/^[A-Za-z0-9_-]+$/.test(possibleSig) && possibleSig.length >= 20) {
      return cookieValue.substring(0, dotIndex);
    }
  }
  return cookieValue;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const cookieStore = await cookies();

    // Try to get and delete the session from database
    const sessionCookie = cookieStore.get(`${COOKIE_PREFIX}.session_token`);
    if (sessionCookie?.value && dbClient.isConfigured()) {
      try {
        const token = parseSessionToken(sessionCookie.value);
        if (token) {
          const db = dbClient.getDb();
          await db.delete(sessions).where(eq(sessions.token, token));
        }
      } catch (dbError) {
        // Log but don't fail - cookie clearing is more important
        console.error('[Sign-out] Failed to delete session from DB:', dbError);
      }
    }

    // Clear all auth cookies
    const response = new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    // Add Set-Cookie headers to clear cookies
    for (const cookieName of SESSION_COOKIE_NAMES) {
      response.headers.append(
        'Set-Cookie',
        `${cookieName}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`
      );
    }

    // Also clear any chunked session data cookies (session_data.0, session_data.1, etc.)
    const allCookies = cookieStore.getAll();
    for (const cookie of allCookies) {
      if (cookie.name.startsWith(`${COOKIE_PREFIX}.session_data.`)) {
        response.headers.append(
          'Set-Cookie',
          `${cookie.name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`
        );
      }
    }

    return response;
  } catch (error) {
    console.error('[Sign-out] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Sign-out failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
