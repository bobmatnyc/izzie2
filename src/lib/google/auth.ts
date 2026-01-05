/**
 * Google Authentication
 * Provides authentication for Google APIs including Gmail and Drive
 */

import { google, Auth } from 'googleapis';
import * as path from 'path';
import * as fs from 'fs/promises';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
];

/**
 * Get service account authentication
 * For server-to-server access (requires domain-wide delegation for Gmail)
 */
export async function getServiceAccountAuth(
  userEmail?: string
): Promise<Auth.GoogleAuth> {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;

  if (!keyPath) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH environment variable is required');
  }

  // Resolve path relative to project root
  const resolvedPath = path.isAbsolute(keyPath)
    ? keyPath
    : path.join(process.cwd(), keyPath);

  // Verify file exists
  try {
    await fs.access(resolvedPath);
  } catch (error) {
    throw new Error(
      `Service account key file not found at: ${resolvedPath}. Error: ${error}`
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: resolvedPath,
    scopes: SCOPES,
    // If userEmail provided, impersonate that user (requires domain-wide delegation)
    ...(userEmail && { clientOptions: { subject: userEmail } }),
  });

  return auth;
}

/**
 * Get OAuth2 client for user consent flow
 * For accessing personal Gmail accounts
 */
export async function getOAuth2Client(
  clientId?: string,
  clientSecret?: string,
  redirectUri?: string
): Promise<Auth.OAuth2Client> {
  const id = clientId || process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = clientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirect = redirectUri || process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:3000/auth/callback';

  if (!id || !secret) {
    throw new Error(
      'GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are required for OAuth2'
    );
  }

  const oauth2Client = new google.auth.OAuth2(id, secret, redirect);

  return oauth2Client;
}

/**
 * Generate OAuth2 authorization URL
 * User must visit this URL to grant permissions
 */
export function getAuthorizationUrl(oauth2Client: Auth.OAuth2Client): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokensFromCode(
  oauth2Client: Auth.OAuth2Client,
  code: string
): Promise<Auth.Credentials> {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return tokens;
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  oauth2Client: Auth.OAuth2Client,
  refreshToken: string
): Promise<Auth.Credentials> {
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials;
}

/**
 * Validate credentials and return auth client
 */
export async function validateAuth(
  auth: Auth.GoogleAuth | Auth.OAuth2Client
): Promise<boolean> {
  try {
    // Get the actual auth client
    let client: Auth.OAuth2Client;
    if (auth instanceof Auth.GoogleAuth) {
      client = (await auth.getClient()) as Auth.OAuth2Client;
    } else {
      client = auth;
    }

    // Simple API call to validate credentials
    const gmail = google.gmail({ version: 'v1', auth: client });
    await gmail.users.getProfile({ userId: 'me' });
    return true;
  } catch (error) {
    console.error('[Gmail Auth] Validation failed:', error);
    return false;
  }
}
