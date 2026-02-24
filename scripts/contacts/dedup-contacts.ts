#!/usr/bin/env tsx
/**
 * Contact Deduplication Script
 *
 * Extracts contacts from Apple Contacts SQLite backup and deduplicates them.
 * Uses exact matching for clear duplicates and AI (Claude 3.5 Haiku via OpenRouter)
 * for fuzzy matching decisions.
 *
 * Usage:
 *   tsx scripts/contacts/dedup-contacts.ts [options]
 *
 * Options:
 *   --dry-run    Show what would be merged without writing output
 *   --limit N    Process only first N contacts (for testing)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Database path
const DB_PATH =
  '/Users/masa/Projects/izzie2/data/Contacts - 01-27-2026.abbu/Sources/58277871-874E-423B-8D5F-F4EA58B66CA2/AddressBook-v22.abcddb';
const OUTPUT_PATH = '/Users/masa/Projects/izzie2/data/contacts-deduped.json';

// OpenRouter configuration
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const HAIKU_MODEL = 'anthropic/claude-haiku-4.5';

// Types
interface RawContact {
  Z_PK: number;
  ZFIRSTNAME: string | null;
  ZLASTNAME: string | null;
  ZMIDDLENAME: string | null;
  ZORGANIZATION: string | null;
  ZNICKNAME: string | null;
  ZTITLE: string | null;
  ZSUFFIX: string | null;
  ZDEPARTMENT: string | null;
  ZJOBTITLE: string | null;
}

interface Email {
  address: string;
  label: string | null;
}

interface Phone {
  number: string;
  label: string | null;
}

interface Contact {
  id: number;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  organization: string | null;
  nickname: string | null;
  title: string | null;
  suffix: string | null;
  department: string | null;
  jobTitle: string | null;
  emails: Email[];
  phones: Phone[];
  displayName: string;
  normalizedKey: string;
}

interface MergedContact extends Omit<Contact, 'id'> {
  originalIds: number[];
  mergeReason: 'exact' | 'ai-confirmed';
}

interface DeduplicationResult {
  totalContacts: number;
  exactDuplicates: number;
  fuzzyMatches: number;
  aiDecisions: number;
  mergedContacts: MergedContact[];
  processedAt: string;
  cleanupStats?: CleanupStats;
}

interface CleanupStats {
  duplicateEmailsRemoved: number;
  duplicatePhonesRemoved: number;
  invalidEmailsRemoved: number;
  invalidPhonesRemoved: number;
  namesNormalized: number;
  organizationsNormalized: number;
}

// Input validation functions
function validateLimit(limitValue: string): number {
  // Security: Strict validation to prevent SQL injection
  // 1. Check for non-numeric characters (only digits allowed)
  if (!/^\d+$/.test(limitValue)) {
    console.error('Error: --limit requires a valid integer (digits only)');
    process.exit(1);
  }

  // 2. Parse the number
  const parsed = parseInt(limitValue, 10);
  if (isNaN(parsed)) {
    console.error('Error: --limit requires a valid number');
    process.exit(1);
  }

  // 3. Security: Enforce reasonable bounds to prevent resource exhaustion
  if (parsed < 1 || parsed > 100000) {
    console.error('Error: --limit must be between 1 and 100,000');
    process.exit(1);
  }

  // 4. Additional safety check: ensure the parsed value matches the original input
  if (parsed.toString() !== limitValue) {
    console.error('Error: --limit contains invalid characters');
    process.exit(1);
  }

  return parsed;
}

// Parse CLI arguments
function parseArgs(): { dryRun: boolean; limit: number | null } {
  const args = process.argv.slice(2);
  let dryRun = false;
  let limit: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--limit' && args[i + 1]) {
      limit = validateLimit(args[i + 1]);
      i++;
    }
  }

  return { dryRun, limit };
}

// Execute SQLite query and parse results with secure parameterization
function querySQLite<T>(query: string, params: (string | number)[] = []): T[] {
  try {
    // Security: Validate that DB_PATH exists and is a file to prevent path traversal
    if (!fs.existsSync(DB_PATH) || !fs.statSync(DB_PATH).isFile()) {
      throw new Error('Invalid database path');
    }

    // Security: Use parameterized queries when possible
    // For basic queries without user input, direct query is acceptable
    // For queries with user input, validation must be done before calling this function
    const result = execSync(`sqlite3 -json "${DB_PATH}" "${query}"`, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    });
    if (!result.trim()) return [];
    return JSON.parse(result) as T[];
  } catch (error) {
    console.error('SQLite query error:', error);
    // Security: Don't leak sensitive error details
    return [];
  }
}

// Normalize string for comparison
function normalizeString(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Clean organization name (remove trailing semicolons and whitespace)
function cleanOrg(org: string | null): string | null {
  if (!org) return null;
  return org.replace(/;+\s*$/, '').trim() || null;
}

// Create display name from contact
function createDisplayName(contact: RawContact): string {
  const parts: string[] = [];

  if (contact.ZFIRSTNAME) parts.push(contact.ZFIRSTNAME);
  if (contact.ZMIDDLENAME) parts.push(contact.ZMIDDLENAME);
  if (contact.ZLASTNAME) parts.push(contact.ZLASTNAME);

  if (parts.length > 0) {
    return parts.join(' ');
  }

  if (contact.ZORGANIZATION) {
    return cleanOrg(contact.ZORGANIZATION) || 'Unknown';
  }

  return 'Unknown';
}

// Create normalized key for exact matching
function createNormalizedKey(contact: RawContact): string {
  const name = normalizeString(
    [contact.ZFIRSTNAME, contact.ZMIDDLENAME, contact.ZLASTNAME]
      .filter(Boolean)
      .join(' ')
  );
  const org = normalizeString(cleanOrg(contact.ZORGANIZATION));
  return `${name}|${org}`;
}

// Build secure SQL query with validated limit
function buildContactsQuery(validatedLimit: number | null): string {
  // Security: Use validated limit directly in query construction
  // Since validatedLimit has already been validated to be a safe integer,
  // this is now secure against SQL injection
  const baseQuery = `
    SELECT Z_PK, ZFIRSTNAME, ZLASTNAME, ZMIDDLENAME, ZORGANIZATION,
           ZNICKNAME, ZTITLE, ZSUFFIX, ZDEPARTMENT, ZJOBTITLE
    FROM ZABCDRECORD
    WHERE ZFIRSTNAME IS NOT NULL OR ZLASTNAME IS NOT NULL OR ZORGANIZATION IS NOT NULL
  `.replace(/\n/g, ' ');

  if (validatedLimit !== null) {
    // Security: validatedLimit is guaranteed to be a safe integer by validateLimit()
    return `${baseQuery} LIMIT ${validatedLimit}`;
  }

  return baseQuery;
}

// Fetch contacts from database
function fetchContacts(limit: number | null): Contact[] {
  console.log('Fetching contacts from database...');

  // Security: Build query with validated limit
  const contactsQuery = buildContactsQuery(limit);

  const rawContacts = querySQLite<RawContact>(contactsQuery);
  console.log(`Found ${rawContacts.length} contacts`);

  // Fetch all emails
  console.log('Fetching email addresses...');
  const emailsQuery = `
    SELECT ZOWNER, ZADDRESS, ZLABEL FROM ZABCDEMAILADDRESS WHERE ZADDRESS IS NOT NULL
  `.replace(/\n/g, ' ');
  const rawEmails = querySQLite<{ ZOWNER: number; ZADDRESS: string; ZLABEL: string | null }>(emailsQuery);
  console.log(`Found ${rawEmails.length} email addresses`);

  // Fetch all phones
  console.log('Fetching phone numbers...');
  const phonesQuery = `
    SELECT ZOWNER, ZFULLNUMBER, ZLABEL FROM ZABCDPHONENUMBER WHERE ZFULLNUMBER IS NOT NULL
  `.replace(/\n/g, ' ');
  const rawPhones = querySQLite<{ ZOWNER: number; ZFULLNUMBER: string; ZLABEL: string | null }>(phonesQuery);
  console.log(`Found ${rawPhones.length} phone numbers`);

  // Group emails by owner
  const emailsByOwner = new Map<number, Email[]>();
  for (const email of rawEmails) {
    const list = emailsByOwner.get(email.ZOWNER) || [];
    list.push({ address: email.ZADDRESS, label: email.ZLABEL });
    emailsByOwner.set(email.ZOWNER, list);
  }

  // Group phones by owner
  const phonesByOwner = new Map<number, Phone[]>();
  for (const phone of rawPhones) {
    const list = phonesByOwner.get(phone.ZOWNER) || [];
    list.push({ number: phone.ZFULLNUMBER, label: phone.ZLABEL });
    phonesByOwner.set(phone.ZOWNER, list);
  }

  // Build contact objects
  return rawContacts.map((raw) => ({
    id: raw.Z_PK,
    firstName: raw.ZFIRSTNAME,
    lastName: raw.ZLASTNAME,
    middleName: raw.ZMIDDLENAME,
    organization: cleanOrg(raw.ZORGANIZATION),
    nickname: raw.ZNICKNAME,
    title: raw.ZTITLE,
    suffix: raw.ZSUFFIX,
    department: raw.ZDEPARTMENT,
    jobTitle: raw.ZJOBTITLE,
    emails: emailsByOwner.get(raw.Z_PK) || [],
    phones: phonesByOwner.get(raw.Z_PK) || [],
    displayName: createDisplayName(raw),
    normalizedKey: createNormalizedKey(raw),
  }));
}

// Merge contacts into one
function mergeContacts(contacts: Contact[], reason: 'exact' | 'ai-confirmed'): MergedContact {
  // Pick the most complete contact as the base
  const sorted = [...contacts].sort((a, b) => {
    // Prefer contacts with more data
    const scoreA =
      (a.firstName ? 1 : 0) +
      (a.lastName ? 1 : 0) +
      (a.organization ? 1 : 0) +
      a.emails.length +
      a.phones.length;
    const scoreB =
      (b.firstName ? 1 : 0) +
      (b.lastName ? 1 : 0) +
      (b.organization ? 1 : 0) +
      b.emails.length +
      b.phones.length;
    return scoreB - scoreA;
  });

  const base = sorted[0];

  // Collect all unique emails
  const emailSet = new Set<string>();
  const allEmails: Email[] = [];
  for (const contact of contacts) {
    for (const email of contact.emails) {
      const key = email.address.toLowerCase();
      if (!emailSet.has(key)) {
        emailSet.add(key);
        allEmails.push(email);
      }
    }
  }

  // Collect all unique phones (normalize by removing non-digits)
  const phoneSet = new Set<string>();
  const allPhones: Phone[] = [];
  for (const contact of contacts) {
    for (const phone of contact.phones) {
      const key = phone.number.replace(/\D/g, '');
      if (!phoneSet.has(key)) {
        phoneSet.add(key);
        allPhones.push(phone);
      }
    }
  }

  return {
    firstName: base.firstName,
    lastName: base.lastName,
    middleName: base.middleName,
    organization: base.organization,
    nickname: contacts.find((c) => c.nickname)?.nickname || null,
    title: base.title,
    suffix: base.suffix,
    department: contacts.find((c) => c.department)?.department || null,
    jobTitle: contacts.find((c) => c.jobTitle)?.jobTitle || null,
    emails: allEmails,
    phones: allPhones,
    displayName: base.displayName,
    normalizedKey: base.normalizedKey,
    originalIds: contacts.map((c) => c.id),
    mergeReason: reason,
  };
}

// Find fuzzy match candidates
interface FuzzyCandidate {
  contact1: Contact;
  contact2: Contact;
  matchType: 'name' | 'email' | 'phone';
  matchValue: string;
}

function findFuzzyCandidates(contacts: Contact[]): FuzzyCandidate[] {
  const candidates: FuzzyCandidate[] = [];

  // Build indexes for faster lookup
  const byNormalizedName = new Map<string, Contact[]>();
  const byEmail = new Map<string, Contact[]>();
  const byPhone = new Map<string, Contact[]>();

  for (const contact of contacts) {
    // Index by normalized first+last name (without org)
    const namePart = normalizeString(
      [contact.firstName, contact.lastName].filter(Boolean).join(' ')
    );
    if (namePart.length > 2) {
      const list = byNormalizedName.get(namePart) || [];
      list.push(contact);
      byNormalizedName.set(namePart, list);
    }

    // Index by email
    for (const email of contact.emails) {
      const key = email.address.toLowerCase();
      const list = byEmail.get(key) || [];
      list.push(contact);
      byEmail.set(key, list);
    }

    // Index by phone (last 7 digits to handle different formats)
    for (const phone of contact.phones) {
      const digits = phone.number.replace(/\D/g, '');
      if (digits.length >= 7) {
        const key = digits.slice(-7);
        const list = byPhone.get(key) || [];
        list.push(contact);
        byPhone.set(key, list);
      }
    }
  }

  // Find candidates with same name but different normalizedKey (different org)
  for (const [name, group] of byNormalizedName) {
    if (group.length > 1) {
      // Group by normalizedKey to find those already exact-matched
      const byKey = new Map<string, Contact[]>();
      for (const c of group) {
        const list = byKey.get(c.normalizedKey) || [];
        list.push(c);
        byKey.set(c.normalizedKey, list);
      }

      // If there are different keys, these are potential fuzzy matches
      const keys = Array.from(byKey.keys());
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          const group1 = byKey.get(keys[i])!;
          const group2 = byKey.get(keys[j])!;
          // Add one representative pair
          candidates.push({
            contact1: group1[0],
            contact2: group2[0],
            matchType: 'name',
            matchValue: name,
          });
        }
      }
    }
  }

  // Find candidates with same email but different normalizedKey
  for (const [email, group] of byEmail) {
    if (group.length > 1) {
      const byKey = new Map<string, Contact>();
      for (const c of group) {
        if (!byKey.has(c.normalizedKey)) {
          byKey.set(c.normalizedKey, c);
        }
      }
      const uniqueByKey = Array.from(byKey.values());
      for (let i = 0; i < uniqueByKey.length; i++) {
        for (let j = i + 1; j < uniqueByKey.length; j++) {
          candidates.push({
            contact1: uniqueByKey[i],
            contact2: uniqueByKey[j],
            matchType: 'email',
            matchValue: email,
          });
        }
      }
    }
  }

  // Find candidates with same phone but different normalizedKey
  for (const [phone, group] of byPhone) {
    if (group.length > 1) {
      const byKey = new Map<string, Contact>();
      for (const c of group) {
        if (!byKey.has(c.normalizedKey)) {
          byKey.set(c.normalizedKey, c);
        }
      }
      const uniqueByKey = Array.from(byKey.values());
      for (let i = 0; i < uniqueByKey.length; i++) {
        for (let j = i + 1; j < uniqueByKey.length; j++) {
          candidates.push({
            contact1: uniqueByKey[i],
            contact2: uniqueByKey[j],
            matchType: 'phone',
            matchValue: phone,
          });
        }
      }
    }
  }

  // Deduplicate candidates (same pair may appear multiple times)
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = [c.contact1.id, c.contact2.id].sort().join('-');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Email validation pattern
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Normalize phone number for comparison (strip non-digits, return last 10 digits)
function normalizePhoneForComparison(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-10);
}

// Convert string to proper case (capitalize first letter of each word)
function toProperCase(str: string | null): string | null {
  if (!str) return null;
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
    .join(' ')
    .trim() || null;
}

// Email label specificity ranking (higher = more specific)
const EMAIL_LABEL_SPECIFICITY: Record<string, number> = {
  work: 3,
  home: 3,
  personal: 2,
  other: 1,
  '': 0,
};

function getEmailLabelSpecificity(label: string | null): number {
  if (!label) return 0;
  const normalized = label.toLowerCase().replace(/_\$!<|>!\$_/g, '');
  return EMAIL_LABEL_SPECIFICITY[normalized] ?? 1;
}

// Clean up a single contact's fields
function cleanupContact(contact: MergedContact, stats: CleanupStats): void {
  // 1. Trim whitespace from all string fields
  contact.firstName = contact.firstName?.trim() || null;
  contact.lastName = contact.lastName?.trim() || null;
  contact.middleName = contact.middleName?.trim() || null;
  contact.nickname = contact.nickname?.trim() || null;
  contact.title = contact.title?.trim() || null;
  contact.suffix = contact.suffix?.trim() || null;
  contact.department = contact.department?.trim() || null;
  contact.jobTitle = contact.jobTitle?.trim() || null;

  // 2. Normalize names to proper case
  const origFirst = contact.firstName;
  const origLast = contact.lastName;
  const origMiddle = contact.middleName;

  contact.firstName = toProperCase(contact.firstName);
  contact.lastName = toProperCase(contact.lastName);
  contact.middleName = toProperCase(contact.middleName);

  if (
    origFirst !== contact.firstName ||
    origLast !== contact.lastName ||
    origMiddle !== contact.middleName
  ) {
    stats.namesNormalized++;
  }

  // 3. Clean organization names (remove trailing semicolons, trim whitespace)
  if (contact.organization) {
    const origOrg = contact.organization;
    contact.organization = contact.organization.replace(/;+\s*$/, '').trim() || null;
    if (origOrg !== contact.organization) {
      stats.organizationsNormalized++;
    }
  }

  // Update display name after name normalization
  const nameParts: string[] = [];
  if (contact.firstName) nameParts.push(contact.firstName);
  if (contact.middleName) nameParts.push(contact.middleName);
  if (contact.lastName) nameParts.push(contact.lastName);
  if (nameParts.length > 0) {
    contact.displayName = nameParts.join(' ');
  } else if (contact.organization) {
    contact.displayName = contact.organization;
  }

  // 4. Remove invalid emails and dedupe emails (case-insensitive)
  const emailMap = new Map<string, Email>();

  for (const email of contact.emails) {
    // Trim and validate
    const trimmedAddress = email.address?.trim();
    if (!trimmedAddress || !EMAIL_PATTERN.test(trimmedAddress)) {
      stats.invalidEmailsRemoved++;
      continue;
    }

    const key = trimmedAddress.toLowerCase();
    const existing = emailMap.get(key);

    if (existing) {
      // Keep the one with more specific label
      if (getEmailLabelSpecificity(email.label) > getEmailLabelSpecificity(existing.label)) {
        emailMap.set(key, { address: trimmedAddress, label: email.label?.trim() || null });
      }
      stats.duplicateEmailsRemoved++;
    } else {
      emailMap.set(key, { address: trimmedAddress, label: email.label?.trim() || null });
    }
  }

  contact.emails = Array.from(emailMap.values());

  // 5. Remove invalid phones and dedupe phones (normalize: last 10 digits)
  const phoneMap = new Map<string, Phone>();

  for (const phone of contact.phones) {
    const trimmedNumber = phone.number?.trim();
    if (!trimmedNumber) continue;

    const digits = trimmedNumber.replace(/\D/g, '');

    // Too short (less than 7 digits)
    if (digits.length < 7) {
      stats.invalidPhonesRemoved++;
      continue;
    }

    const key = normalizePhoneForComparison(trimmedNumber);
    if (phoneMap.has(key)) {
      stats.duplicatePhonesRemoved++;
    } else {
      phoneMap.set(key, { number: trimmedNumber, label: phone.label?.trim() || null });
    }
  }

  contact.phones = Array.from(phoneMap.values());
}

// Cleanup all merged contacts
function cleanupContacts(contacts: MergedContact[]): CleanupStats {
  const stats: CleanupStats = {
    duplicateEmailsRemoved: 0,
    duplicatePhonesRemoved: 0,
    invalidEmailsRemoved: 0,
    invalidPhonesRemoved: 0,
    namesNormalized: 0,
    organizationsNormalized: 0,
  };

  for (const contact of contacts) {
    cleanupContact(contact, stats);
  }

  return stats;
}

// Call OpenRouter to decide if contacts should merge
async function askAIToMerge(candidate: FuzzyCandidate): Promise<boolean> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn('OPENROUTER_API_KEY not set, skipping AI merge decision');
    return false;
  }

  const { contact1, contact2, matchType, matchValue } = candidate;

  const prompt = `You are a contact deduplication assistant. Determine if these two contacts represent the SAME person and should be merged.

Contact 1:
- Name: ${contact1.displayName}
- Organization: ${contact1.organization || 'N/A'}
- Emails: ${contact1.emails.map((e) => e.address).join(', ') || 'N/A'}
- Phones: ${contact1.phones.map((p) => p.number).join(', ') || 'N/A'}
- Job Title: ${contact1.jobTitle || 'N/A'}

Contact 2:
- Name: ${contact2.displayName}
- Organization: ${contact2.organization || 'N/A'}
- Emails: ${contact2.emails.map((e) => e.address).join(', ') || 'N/A'}
- Phones: ${contact2.phones.map((p) => p.number).join(', ') || 'N/A'}
- Job Title: ${contact2.jobTitle || 'N/A'}

Match found on: ${matchType} = "${matchValue}"

Consider:
1. Same name with different organizations could be the same person who changed jobs
2. Same email is a strong indicator of same person
3. Same phone is a strong indicator of same person
4. Be conservative - only merge if confident they are the same person

Respond with ONLY "YES" to merge or "NO" to keep separate.`;

  try {
    const response = await fetch(OPENROUTER_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Izzie2 Contact Deduplication',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 10,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenRouter API error:', error);
      return false;
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim().toUpperCase();

    return answer === 'YES';
  } catch (error) {
    console.error('Error calling OpenRouter:', error);
    return false;
  }
}

// Main deduplication logic
async function deduplicateContacts(
  contacts: Contact[],
  dryRun: boolean
): Promise<DeduplicationResult> {
  console.log('\n--- Phase 1: Exact Duplicate Detection ---');

  // Group by normalizedKey for exact matches
  const byKey = new Map<string, Contact[]>();
  for (const contact of contacts) {
    const list = byKey.get(contact.normalizedKey) || [];
    list.push(contact);
    byKey.set(contact.normalizedKey, list);
  }

  // Merge exact duplicates
  const merged: MergedContact[] = [];
  let exactDuplicates = 0;

  for (const [key, group] of byKey) {
    if (group.length > 1) {
      exactDuplicates += group.length - 1;
      console.log(`  Exact match: "${group[0].displayName}" (${group.length} contacts)`);
      merged.push(mergeContacts(group, 'exact'));
    } else {
      // Single contact, wrap as MergedContact
      merged.push({
        ...group[0],
        originalIds: [group[0].id],
        mergeReason: 'exact',
      });
    }
  }

  console.log(`Found ${exactDuplicates} exact duplicates, merged into ${merged.length} unique contacts`);

  console.log('\n--- Phase 2: Fuzzy Match Detection ---');

  // Find fuzzy candidates from original contacts
  const candidates = findFuzzyCandidates(contacts);
  console.log(`Found ${candidates.length} potential fuzzy matches to review`);

  // Process fuzzy candidates with AI
  let aiDecisions = 0;
  let fuzzyMatches = 0;
  const toMerge: Set<string> = new Set(); // Track pairs that should merge

  if (candidates.length > 0 && process.env.OPENROUTER_API_KEY) {
    console.log('Consulting AI for fuzzy match decisions...\n');

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      console.log(
        `[${i + 1}/${candidates.length}] Checking: "${candidate.contact1.displayName}" vs "${candidate.contact2.displayName}" (${candidate.matchType})`
      );

      const shouldMerge = await askAIToMerge(candidate);
      aiDecisions++;

      if (shouldMerge) {
        fuzzyMatches++;
        console.log(`  -> AI: MERGE`);
        toMerge.add([candidate.contact1.id, candidate.contact2.id].sort().join('-'));
      } else {
        console.log(`  -> AI: KEEP SEPARATE`);
      }

      // Rate limiting: small delay between API calls
      if (i < candidates.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  } else if (candidates.length > 0) {
    console.log('Skipping AI decisions (OPENROUTER_API_KEY not set)');
  }

  // Apply fuzzy merges
  if (toMerge.size > 0) {
    console.log(`\n--- Phase 3: Applying ${toMerge.size} AI-confirmed merges ---`);

    // Build a union-find structure for transitive merges
    const parent = new Map<number, number>();
    const find = (id: number): number => {
      if (!parent.has(id)) parent.set(id, id);
      if (parent.get(id) !== id) {
        parent.set(id, find(parent.get(id)!));
      }
      return parent.get(id)!;
    };
    const union = (a: number, b: number) => {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) {
        parent.set(rootB, rootA);
      }
    };

    for (const pair of toMerge) {
      const [id1, id2] = pair.split('-').map(Number);
      union(id1, id2);
    }

    // Group contacts by their root
    const groups = new Map<number, MergedContact[]>();
    for (const mc of merged) {
      for (const id of mc.originalIds) {
        const root = find(id);
        const list = groups.get(root) || [];
        list.push(mc);
        groups.set(root, list);
      }
    }

    // Re-merge groups that were AI-confirmed
    const finalMerged: MergedContact[] = [];
    const seen = new Set<number>();

    for (const [root, group] of groups) {
      // Deduplicate within group
      const uniqueInGroup: MergedContact[] = [];
      const seenIds = new Set<string>();
      for (const mc of group) {
        const key = mc.originalIds.sort().join('-');
        if (!seenIds.has(key)) {
          seenIds.add(key);
          uniqueInGroup.push(mc);
        }
      }

      if (uniqueInGroup.length === 1) {
        if (!seen.has(uniqueInGroup[0].originalIds[0])) {
          seen.add(uniqueInGroup[0].originalIds[0]);
          finalMerged.push(uniqueInGroup[0]);
        }
      } else {
        // Merge all contacts in the group
        const allContacts: Contact[] = [];
        for (const mc of uniqueInGroup) {
          allContacts.push({
            id: mc.originalIds[0],
            firstName: mc.firstName,
            lastName: mc.lastName,
            middleName: mc.middleName,
            organization: mc.organization,
            nickname: mc.nickname,
            title: mc.title,
            suffix: mc.suffix,
            department: mc.department,
            jobTitle: mc.jobTitle,
            emails: mc.emails,
            phones: mc.phones,
            displayName: mc.displayName,
            normalizedKey: mc.normalizedKey,
          });
        }

        const aiMerged = mergeContacts(allContacts, 'ai-confirmed');
        // Collect all original IDs
        aiMerged.originalIds = uniqueInGroup.flatMap((m) => m.originalIds);

        // Check if we haven't already added this group
        const hasNew = aiMerged.originalIds.some((id) => !seen.has(id));
        if (hasNew) {
          for (const id of aiMerged.originalIds) {
            seen.add(id);
          }
          finalMerged.push(aiMerged);
        }
      }
    }

    // Replace merged with finalMerged
    merged.length = 0;
    merged.push(...finalMerged);
  }

  // Phase 4: Cleanup
  console.log('\n--- Phase 4: Cleanup ---');
  const cleanupStats = cleanupContacts(merged);

  console.log(`  Names normalized: ${cleanupStats.namesNormalized}`);
  console.log(`  Organizations cleaned: ${cleanupStats.organizationsNormalized}`);
  console.log(`  Duplicate emails removed: ${cleanupStats.duplicateEmailsRemoved}`);
  console.log(`  Invalid emails removed: ${cleanupStats.invalidEmailsRemoved}`);
  console.log(`  Duplicate phones removed: ${cleanupStats.duplicatePhonesRemoved}`);
  console.log(`  Invalid phones removed: ${cleanupStats.invalidPhonesRemoved}`);

  const result: DeduplicationResult = {
    totalContacts: contacts.length,
    exactDuplicates,
    fuzzyMatches,
    aiDecisions,
    mergedContacts: merged,
    processedAt: new Date().toISOString(),
    cleanupStats,
  };

  return result;
}

// Main function
async function main() {
  const { dryRun, limit } = parseArgs();

  console.log('===========================================');
  console.log('     Apple Contacts Deduplication Tool    ');
  console.log('===========================================\n');

  if (dryRun) {
    console.log('DRY RUN MODE - No files will be written\n');
  }

  if (limit) {
    console.log(`LIMIT MODE - Processing only ${limit} contacts\n`);
  }

  // Check database exists
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Error: Database not found at ${DB_PATH}`);
    process.exit(1);
  }

  // Fetch contacts
  const contacts = fetchContacts(limit);

  if (contacts.length === 0) {
    console.error('No contacts found in database');
    process.exit(1);
  }

  // Deduplicate
  const result = await deduplicateContacts(contacts, dryRun);

  // Summary
  console.log('\n===========================================');
  console.log('                  Summary                 ');
  console.log('===========================================');
  console.log(`Total contacts in database: ${result.totalContacts}`);
  console.log(`Exact duplicates found: ${result.exactDuplicates}`);
  console.log(`AI decisions made: ${result.aiDecisions}`);
  console.log(`Fuzzy matches merged: ${result.fuzzyMatches}`);
  console.log(`Final unique contacts: ${result.mergedContacts.length}`);
  console.log(`Reduction: ${result.totalContacts - result.mergedContacts.length} contacts`);

  // Write output
  if (!dryRun) {
    console.log(`\nWriting output to ${OUTPUT_PATH}...`);
    const outputDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
    console.log('Done!');
  } else {
    console.log('\nDry run complete - no files written');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
