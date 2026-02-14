#!/usr/bin/env node
/**
 * Script to fix authentication error handling across all API routes
 *
 * This script:
 * 1. Adds handleApiError import to files using requireAuth
 * 2. Replaces catch blocks that return status 500 with handleApiError calls
 * 3. Removes redundant authentication error handling code
 *
 * Run with: node scripts/fix-auth-errors.js
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRY_RUN = process.argv.includes('--dry-run');
const API_DIR = path.join(__dirname, '../src/app/api');

console.log(`🔧 Starting authentication error handling fix ${DRY_RUN ? '(DRY RUN)' : ''}`);
console.log(`📁 Scanning: ${API_DIR}\n`);

/**
 * Find all route.ts files that use requireAuth
 */
function findRouteFiles() {
  try {
    const result = execSync(
      `grep -rl "requireAuth(" "${API_DIR}" --include="route.ts"`,
      { encoding: 'utf-8' }
    );
    return result.trim().split('\n').filter(Boolean);
  } catch (error) {
    return [];
  }
}

/**
 * Check if file already imports handleApiError
 */
function hasHandleApiErrorImport(content) {
  return content.includes('handleApiError');
}

/**
 * Check if file imports AuthenticationError (needs to be removed)
 */
function hasAuthenticationErrorImport(content) {
  return content.includes('AuthenticationError');
}

/**
 * Add handleApiError import to file
 */
function addHandleApiErrorImport(content) {
  // Check if already has the import
  if (hasHandleApiErrorImport(content)) {
    return content;
  }

  // Find the requireAuth import line
  const requireAuthImportRegex = /import\s*{\s*([^}]+)\s*}\s*from\s*['"]@\/lib\/auth['"]/;
  const match = content.match(requireAuthImportRegex);

  if (!match) {
    console.warn('    ⚠️  Could not find requireAuth import to add handleApiError');
    return content;
  }

  // Add handleApiError import after requireAuth import
  const addImportLine = `import { handleApiError } from '@/lib/api/error-handler';`;
  return content.replace(
    requireAuthImportRegex,
    `$&\n${addImportLine}`
  );
}

/**
 * Remove AuthenticationError import if present
 */
function removeAuthenticationErrorImport(content) {
  if (!hasAuthenticationErrorImport(content)) {
    return content;
  }

  // Remove from combined import: { requireAuth, AuthenticationError }
  content = content.replace(
    /import\s*{\s*requireAuth\s*,\s*AuthenticationError\s*}\s*from\s*['"]@\/lib\/auth['"]/,
    `import { requireAuth } from '@/lib/auth'`
  );

  // Remove from reverse order: { AuthenticationError, requireAuth }
  content = content.replace(
    /import\s*{\s*AuthenticationError\s*,\s*requireAuth\s*}\s*from\s*['"]@\/lib\/auth['"]/,
    `import { requireAuth } from '@/lib/auth'`
  );

  return content;
}

/**
 * Find LOG_PREFIX constant if it exists
 */
function findLogPrefix(content) {
  const match = content.match(/const\s+LOG_PREFIX\s*=\s*['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}

/**
 * Replace catch block with handleApiError call
 */
function fixCatchBlock(content) {
  const logPrefix = findLogPrefix(content);

  // Pattern 1: Catch block with explicit AuthenticationError check
  const pattern1 = /} catch \(error\) {\s*console\.error\([^;]+\);\s*\/\/ Handle authentication errors[^\}]*if \(error instanceof AuthenticationError\) \{[^\}]*\}[^\}]*if \(error instanceof z\.ZodError\) \{[^\}]*\}[^\}]*return NextResponse\.json\([^;]*,\s*{\s*status:\s*500\s*}\s*\);\s*}/gs;

  // Pattern 2: Catch block with message.includes('Unauthorized') check
  const pattern2 = /} catch \(error\) {\s*console\.error\([^;]+\);\s*if \(error instanceof Error && error\.message\.includes\(['"]Unauthorized['"]\)\) \{[^\}]*\}[^\}]*return NextResponse\.json\([^;]*,\s*{\s*status:\s*500\s*}\s*\);\s*}/gs;

  // Pattern 3: Simple catch block returning 500
  const pattern3 = /} catch \(error\) {\s*console\.error\([^;]+\);\s*return NextResponse\.json\([^;]*,\s*{\s*status:\s*500\s*}\s*\);\s*}/gs;

  // Extract error message from existing catch block
  let errorMessage = 'Internal server error';
  const errorMsgMatch = content.match(/error:\s*['"]([^'"]+)['"]/);
  if (errorMsgMatch) {
    errorMessage = errorMsgMatch[1];
  }

  const replacement = logPrefix
    ? `} catch (error) {\n    return handleApiError(error, '${logPrefix}', '${errorMessage}');\n  }`
    : `} catch (error) {\n    return handleApiError(error, '[API]', '${errorMessage}');\n  }`;

  // Try all patterns
  let modified = content.replace(pattern1, replacement);
  if (modified === content) {
    modified = content.replace(pattern2, replacement);
  }
  if (modified === content) {
    modified = content.replace(pattern3, replacement);
  }

  return modified;
}

/**
 * Process a single file
 */
function processFile(filePath) {
  const relativePath = path.relative(process.cwd(), filePath);
  console.log(`📄 Processing: ${relativePath}`);

  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  // Skip if already using handleApiError correctly
  if (hasHandleApiErrorImport(content) && !hasAuthenticationErrorImport(content)) {
    const catchBlocksFixed = !content.includes('status: 500') ||
                            content.includes('handleApiError(error');
    if (catchBlocksFixed) {
      console.log('    ✅ Already fixed\n');
      return { processed: true, modified: false };
    }
  }

  // Step 1: Add handleApiError import
  const withImport = addHandleApiErrorImport(content);
  if (withImport !== content) {
    console.log('    ➕ Added handleApiError import');
    content = withImport;
    modified = true;
  }

  // Step 2: Remove AuthenticationError import if present
  const withoutAuthError = removeAuthenticationErrorImport(content);
  if (withoutAuthError !== content) {
    console.log('    ➖ Removed AuthenticationError import');
    content = withoutAuthError;
    modified = true;
  }

  // Step 3: Fix catch blocks
  const fixed = fixCatchBlock(content);
  if (fixed !== content) {
    console.log('    🔧 Fixed catch block(s)');
    content = fixed;
    modified = true;
  }

  // Write changes if not dry run
  if (modified && !DRY_RUN) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('    💾 Saved changes\n');
  } else if (modified) {
    console.log('    🔍 Would save changes (DRY RUN)\n');
  } else {
    console.log('    ⚠️  No changes needed\n');
  }

  return { processed: true, modified };
}

/**
 * Main execution
 */
function main() {
  const files = findRouteFiles();

  console.log(`Found ${files.length} files using requireAuth\n`);
  console.log('─'.repeat(60) + '\n');

  let processedCount = 0;
  let modifiedCount = 0;
  const errors = [];

  for (const file of files) {
    try {
      const { processed, modified } = processFile(file);
      if (processed) processedCount++;
      if (modified) modifiedCount++;
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
      errors.push({ file, error: error.message });
    }
  }

  console.log('─'.repeat(60));
  console.log(`\n📊 Summary:`);
  console.log(`   Processed: ${processedCount} files`);
  console.log(`   Modified:  ${modifiedCount} files`);
  console.log(`   Errors:    ${errors.length} files`);

  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(({ file, error }) => {
      console.log(`   ${path.relative(process.cwd(), file)}: ${error}`);
    });
  }

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN: No files were modified');
    console.log('   Run without --dry-run to apply changes\n');
  } else {
    console.log('\n✅ Migration complete!\n');
  }
}

main();
