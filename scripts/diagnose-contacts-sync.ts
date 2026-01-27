#!/usr/bin/env bun
/**
 * Diagnostic script for Google Contacts Sync
 *
 * This script helps diagnose why contacts sync might not be working by:
 * 1. Checking if the user's token has the contacts.readonly scope
 * 2. Testing the Google People API directly
 * 3. Showing detailed error information
 *
 * Usage: bun run scripts/diagnose-contacts-sync.ts [userId]
 *        If no userId provided, will show all users with Google accounts
 */

import { dbClient } from '@/lib/db/client';
import { accounts as accountTable } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { google } from 'googleapis';

const REQUIRED_SCOPE = 'https://www.googleapis.com/auth/contacts.readonly';

// Get Drizzle DB instance
const db = dbClient.getDb();

async function listAllGoogleAccounts() {
  console.log('\nNo userId provided. Listing all users with Google accounts:\n');

  const accounts = await db
    .select({
      userId: accountTable.userId,
      providerId: accountTable.providerId,
      scope: accountTable.scope,
      accessTokenExpiresAt: accountTable.accessTokenExpiresAt,
    })
    .from(accountTable)
    .where(eq(accountTable.providerId, 'google'));

  if (accounts.length === 0) {
    console.log('No Google accounts found in database.');
    process.exit(0);
  }

  console.log('Found Google accounts:');
  console.log('-'.repeat(60));

  for (const acc of accounts) {
    const hasContactsScope = acc.scope?.includes(REQUIRED_SCOPE) ?? false;
    const isExpired = acc.accessTokenExpiresAt ? new Date(acc.accessTokenExpiresAt) < new Date() : true;

    console.log(`User ID: ${acc.userId}`);
    console.log(`  Has contacts.readonly scope: ${hasContactsScope ? 'YES' : 'NO'}`);
    console.log(`  Token expired: ${isExpired ? 'YES' : 'NO'}`);
    console.log(`  Scopes: ${acc.scope || 'none'}`);
    console.log();
  }

  console.log('\nUsage: bun run scripts/diagnose-contacts-sync.ts <userId>');
}

async function diagnoseUser(userId: string) {
  console.log(`\nDiagnosing contacts sync for user: ${userId}\n`);

  // Step 1: Get the user's Google account
  console.log('Step 1: Checking database for Google account...');
  console.log('-'.repeat(60));

  const accounts = await db
    .select()
    .from(accountTable)
    .where(eq(accountTable.userId, userId));

  const googleAccount = accounts.find(acc => acc.providerId === 'google');

  if (!googleAccount) {
    console.log('ERROR: No Google account found for this user.');
    console.log('The user needs to sign in with Google first.');
    process.exit(1);
  }

  console.log('Google account found.');
  console.log(`  Account ID: ${googleAccount.id}`);
  console.log(`  Created: ${googleAccount.createdAt}`);
  console.log(`  Updated: ${googleAccount.updatedAt}`);

  // Step 2: Check scopes
  console.log('\nStep 2: Checking OAuth scopes...');
  console.log('-'.repeat(60));

  // Scopes can be space-separated (OAuth spec) or comma-separated (stored format)
  const scopeString = googleAccount.scope || '';
  const scopes = scopeString.includes(',')
    ? scopeString.split(',')
    : scopeString.split(' ');
  console.log(`Total scopes granted: ${scopes.length}`);

  const hasContactsScope = scopes.includes(REQUIRED_SCOPE);
  console.log(`\nRequired scope: ${REQUIRED_SCOPE}`);
  console.log(`Has required scope: ${hasContactsScope ? 'YES' : 'NO'}`);

  if (!hasContactsScope) {
    console.log('\n*** DIAGNOSIS: SCOPE MISSING ***');
    console.log('The user needs to re-authenticate to grant the contacts.readonly scope.');
    console.log('This typically happens when the scope was added after the user first signed in.');
    console.log('\nTo fix: The user should sign out and sign back in with Google.');
  }

  console.log('\nAll granted scopes:');
  for (const scope of scopes) {
    const marker = scope === REQUIRED_SCOPE ? ' <-- REQUIRED' : '';
    console.log(`  - ${scope}${marker}`);
  }

  // Step 3: Check token validity
  console.log('\nStep 3: Checking token validity...');
  console.log('-'.repeat(60));

  const hasAccessToken = !!googleAccount.accessToken;
  const hasRefreshToken = !!googleAccount.refreshToken;
  const accessTokenExpiry = googleAccount.accessTokenExpiresAt;
  const isExpired = accessTokenExpiry ? new Date(accessTokenExpiry) < new Date() : true;

  console.log(`Has access token: ${hasAccessToken ? 'YES' : 'NO'}`);
  console.log(`Has refresh token: ${hasRefreshToken ? 'YES' : 'NO'}`);
  console.log(`Access token expires: ${accessTokenExpiry || 'unknown'}`);
  console.log(`Token expired: ${isExpired ? 'YES' : 'NO'}`);

  if (!hasAccessToken) {
    console.log('\n*** DIAGNOSIS: NO ACCESS TOKEN ***');
    console.log('The user needs to re-authenticate with Google.');
    process.exit(1);
  }

  // Step 4: Test the Google People API
  console.log('\nStep 4: Testing Google People API...');
  console.log('-'.repeat(60));

  if (!hasContactsScope) {
    console.log('Skipping API test - contacts scope is missing.');
    console.log('The API call would fail with "Insufficient Permission" error.');
  } else {
    try {
      // Create OAuth2 client
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );

      oauth2Client.setCredentials({
        access_token: googleAccount.accessToken,
        refresh_token: googleAccount.refreshToken || undefined,
      });

      // Initialize People API
      const people = google.people({ version: 'v1', auth: oauth2Client });

      console.log('Calling People API to fetch contacts...');

      const response = await people.people.connections.list({
        resourceName: 'people/me',
        pageSize: 10, // Just fetch a few for testing
        personFields: 'names,emailAddresses',
      });

      const connections = response.data.connections || [];
      const totalPeople = response.data.totalPeople || 0;

      console.log(`\nAPI call successful!`);
      console.log(`Total contacts in Google: ${totalPeople}`);
      console.log(`Contacts in this page: ${connections.length}`);

      if (connections.length > 0) {
        console.log('\nSample contacts:');
        for (const person of connections.slice(0, 5)) {
          const name = person.names?.[0]?.displayName || 'No name';
          const email = person.emailAddresses?.[0]?.value || 'No email';
          console.log(`  - ${name} (${email})`);
        }
      }

      if (totalPeople === 0) {
        console.log('\n*** DIAGNOSIS: NO CONTACTS ***');
        console.log('The API works but the user has no contacts in Google Contacts.');
        console.log('This is not an error - the user simply has no contacts to sync.');
        console.log('\nTo test with contacts:');
        console.log('1. Go to https://contacts.google.com');
        console.log('2. Add some test contacts');
        console.log('3. Run this diagnostic again or trigger sync from the UI');
      } else {
        console.log('\n*** DIAGNOSIS: CONTACTS AVAILABLE ***');
        console.log('The API works and contacts are available.');
        console.log('If sync is not working, there may be an issue with the sync process itself.');
      }

    } catch (error: any) {
      console.log('\nAPI call failed!');

      if (error.code === 403) {
        console.log('\n*** DIAGNOSIS: INSUFFICIENT PERMISSION (403) ***');
        console.log('Error:', error.message);
        console.log('\nThis usually means:');
        console.log('1. The contacts.readonly scope is missing from the token');
        console.log('2. The user needs to re-authenticate to grant the new scope');
      } else if (error.code === 401) {
        console.log('\n*** DIAGNOSIS: UNAUTHORIZED (401) ***');
        console.log('Error:', error.message);
        console.log('\nThis usually means:');
        console.log('1. The access token is expired and refresh failed');
        console.log('2. The refresh token is invalid or revoked');
        console.log('3. The user needs to sign in again');
      } else {
        console.log('\n*** DIAGNOSIS: API ERROR ***');
        console.log('Error code:', error.code);
        console.log('Error message:', error.message);
        if (error.errors) {
          console.log('Error details:', JSON.stringify(error.errors, null, 2));
        }
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const issues: string[] = [];

  if (!hasContactsScope) {
    issues.push('Missing contacts.readonly scope - user needs to re-authenticate');
  }
  if (!hasAccessToken) {
    issues.push('No access token - user needs to sign in');
  }
  if (isExpired && !hasRefreshToken) {
    issues.push('Token expired with no refresh token - user needs to sign in again');
  }

  if (issues.length === 0) {
    console.log('\nNo issues detected. Contacts sync should work.');
    console.log('If it still does not work, check the application logs for errors.');
  } else {
    console.log('\nIssues found:');
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
    console.log('\nRecommendation: Have the user sign out and sign back in with Google.');
  }
}

async function main() {
  const userId = process.argv[2];

  console.log('='.repeat(60));
  console.log('Google Contacts Sync Diagnostic Tool');
  console.log('='.repeat(60));

  if (!userId) {
    await listAllGoogleAccounts();
  } else {
    await diagnoseUser(userId);
  }
}

main().catch((error) => {
  console.error('Diagnostic script failed:', error);
  process.exit(1);
});
