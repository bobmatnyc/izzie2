# Versioning and Build Tracking Implementation

## Summary

This document describes the implementation of semantic versioning and build tracking for Izzie2.

## Implementation Date
January 5, 2026

## Components Implemented

### 1. Scripts (`/scripts`)

#### `version.sh` - Semantic Version Bumper
**Location:** `scripts/version.sh`

**Features:**
- Validates working directory state
- Bumps version using npm (patch/minor/major)
- Auto-generates build info
- Commits changes with conventional commit message
- Creates git tag with version

**Usage:**
```bash
npm run version:patch   # 1.0.0 → 1.0.1
npm run version:minor   # 1.0.0 → 1.1.0
npm run version:major   # 1.0.0 → 2.0.0
```

#### `build-info.sh` - Build Metadata Generator
**Location:** `scripts/build-info.sh`

**Features:**
- Generates TypeScript file with build metadata
- Includes version, git hash, branch, timestamp, Node version
- Tracks if working directory is dirty
- Automatically run during build process

**Output:** `src/lib/build-info.ts`

**Generated structure:**
```typescript
export const BUILD_INFO = {
  version: string;
  gitHash: string;
  gitBranch: string;
  buildTime: string;
  nodeVersion: string;
  isDirty: boolean;
} as const;
```

#### `changelog.sh` - Changelog Generator
**Location:** `scripts/changelog.sh`

**Features:**
- Parses conventional commits from git history
- Groups changes by version (from git tags)
- Supports unreleased changes
- Links to PRs and commits on GitHub
- Follows Keep a Changelog format

**Output:** `CHANGELOG.md`

### 2. Build Info Module

**Location:** `src/lib/build-info.ts`

**Purpose:**
- Auto-generated TypeScript module with build metadata
- Imported by application code
- Used in health endpoint

**Auto-generation:**
- Run manually: `npm run build:info`
- Run automatically: During `npm run build`
- Run on version bump: During `npm run version:*`

### 3. Health Endpoint Enhancement

**Location:** `src/app/api/health/route.ts`

**Changes:**
- Imports `BUILD_INFO` from `@/lib/build-info`
- Returns build metadata in response
- Provides version, git hash, branch, and build time

**Response format:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-05T18:00:00.000Z",
  "service": "Izzie2",
  "version": "1.0.0",
  "build": {
    "gitHash": "1515379",
    "gitBranch": "feature/poc-1-project-setup",
    "buildTime": "2026-01-05T18:17:26Z",
    "nodeVersion": "v25.2.1",
    "isDirty": true
  }
}
```

### 4. NPM Scripts

**Location:** `package.json`

**Added scripts:**
```json
{
  "version:patch": "./scripts/version.sh patch",
  "version:minor": "./scripts/version.sh minor",
  "version:major": "./scripts/version.sh major",
  "build:info": "./scripts/build-info.sh",
  "changelog": "./scripts/changelog.sh",
  "release": "npm run version:patch && npm run changelog && npm run build:info"
}
```

**Updated scripts:**
```json
{
  "build": "npm run build:info && next build"
}
```

### 5. Git Hooks

#### Pre-Push Hook
**Location:** `.git/hooks/pre-push`

**Features:**
- Validates build-info.ts is current before push
- Compares git hash in build-info with HEAD
- Auto-regenerates if out of date
- Blocks push if uncommitted build-info changes exist

**Purpose:**
Prevent pushing stale build metadata to repository.

### 6. Documentation

#### Versioning Guide
**Location:** `docs/VERSIONING.md`

**Contents:**
- Complete versioning workflow documentation
- Script usage examples
- Release procedures
- Troubleshooting guide
- Best practices

## File Structure

```
izzie2/
├── scripts/
│   ├── version.sh          # Version bumper
│   ├── build-info.sh       # Build metadata generator
│   ├── changelog.sh        # Changelog generator
│   └── ...                 # Other scripts
├── src/
│   ├── lib/
│   │   └── build-info.ts   # Auto-generated build metadata
│   └── app/
│       └── api/
│           └── health/
│               └── route.ts # Health endpoint (updated)
├── docs/
│   ├── VERSIONING.md                 # Versioning guide
│   └── VERSIONING_IMPLEMENTATION.md  # This file
├── .git/
│   └── hooks/
│       └── pre-push        # Build info validation hook
├── CHANGELOG.md            # Auto-generated changelog
└── package.json            # Updated with new scripts
```

## Usage Examples

### Standard Workflow

```bash
# 1. Make changes and commit
git add .
git commit -m "feat: add new feature"

# 2. Bump version (patch for bug fixes, minor for features)
npm run version:patch

# 3. Generate changelog
npm run changelog

# 4. Review changes
git log -1
cat CHANGELOG.md

# 5. Push (pre-push hook validates build-info)
git push && git push --tags
```

### Quick Release

```bash
# Make changes
git add .
git commit -m "fix: resolve issue"

# Quick release (combines version bump, changelog, build info)
npm run release

# Push
git push && git push --tags
```

### Manual Build Info Update

```bash
# Regenerate build info
npm run build:info

# Check the output
cat src/lib/build-info.ts
```

## Testing

### Test Health Endpoint

Start dev server and test endpoint:

```bash
npm run dev

# In another terminal
curl http://localhost:3300/api/health | jq
```

Expected response includes version and build info.

### Test Version Bump

```bash
# Test patch version bump (dry run not available, review with git show)
npm run version:patch

# Review the commit
git show

# Review the tag
git tag -l "v*"

# Undo if needed
git reset --hard HEAD~1
git tag -d v1.0.1
```

### Test Changelog Generation

```bash
# Generate changelog
npm run changelog

# Review output
cat CHANGELOG.md
```

### Test Pre-Push Hook

```bash
# Make a change without updating build-info
echo "// test" >> src/app/api/health/route.ts
git add src/app/api/health/route.ts
git commit -m "test: verify pre-push hook"

# Try to push (should regenerate build-info and block)
git push

# Expected: Hook regenerates build-info and requires commit
```

## Integration Points

### CI/CD Integration

The build process automatically updates build-info:

```json
{
  "scripts": {
    "build": "npm run build:info && next build"
  }
}
```

This ensures every deployment has current build metadata.

### Application Code

Import build info anywhere in the application:

```typescript
import { BUILD_INFO } from '@/lib/build-info';

// Use in logging
console.log(`App version: ${BUILD_INFO.version}`);
console.log(`Deployed from: ${BUILD_INFO.gitBranch}@${BUILD_INFO.gitHash}`);

// Use in error tracking
errorTracker.setContext({
  version: BUILD_INFO.version,
  gitHash: BUILD_INFO.gitHash,
});
```

## Maintenance

### Updating Scripts

Scripts are in `scripts/` directory. After modifying:

```bash
# Ensure executable
chmod +x scripts/*.sh

# Test changes
./scripts/build-info.sh
./scripts/changelog.sh
```

### Updating Hook

The pre-push hook is in `.git/hooks/pre-push`.

**Note:** This file is not tracked by git. Document installation in README:

```bash
# Install pre-push hook (for new clones)
cp .git/hooks/pre-push.sample .git/hooks/pre-push
chmod +x .git/hooks/pre-push
```

Or consider using a git hook manager like Husky.

## Known Limitations

1. **Pre-push hook not version controlled** - Need to document installation
2. **Changelog requires tags** - First release needs manual tag creation
3. **Dirty flag in build-info** - Shows true during development
4. **Script dependencies** - Requires bash, git, npm, node

## Future Enhancements

Potential improvements:

1. **Husky integration** - Version control git hooks
2. **GitHub Actions** - Automate releases on tag push
3. **Release notes** - Auto-generate from changelog
4. **NPM version hooks** - Use npm's built-in version hooks
5. **Conventional commit linting** - Enforce commit format
6. **Automated releases** - CI/CD triggered releases

## Troubleshooting

### Build-info out of sync

```bash
npm run build:info
git add src/lib/build-info.ts
git commit -m "chore: update build info"
```

### Hook not executing

```bash
# Check if hook is executable
ls -la .git/hooks/pre-push

# Make executable if needed
chmod +x .git/hooks/pre-push
```

### Changelog missing commits

Ensure commits use conventional commit format:
- `feat:` for features
- `fix:` for bug fixes
- `docs:` for documentation
- etc.

## Related Documentation

- [VERSIONING.md](./VERSIONING.md) - Complete versioning guide
- [Keep a Changelog](https://keepachangelog.com/) - Changelog format
- [Semantic Versioning](https://semver.org/) - Version numbering
- [Conventional Commits](https://www.conventionalcommits.org/) - Commit format

## Credits

Implementation based on:
- Semantic Versioning specification
- Keep a Changelog format
- Conventional Commits standard
- Git best practices
