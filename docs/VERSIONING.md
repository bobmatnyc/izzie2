# Versioning and Release Management

This document describes the versioning and release workflow for Izzie2.

## Overview

Izzie2 uses [Semantic Versioning](https://semver.org/) (semver) for version management:
- **MAJOR** version for incompatible API changes
- **MINOR** version for backward-compatible functionality additions
- **PATCH** version for backward-compatible bug fixes

## Scripts

All versioning scripts are located in `scripts/`:

### version.sh
Handles semantic version bumping and git tagging.

```bash
# Bump patch version (0.0.X)
npm run version:patch

# Bump minor version (0.X.0)
npm run version:minor

# Bump major version (X.0.0)
npm run version:major
```

**What it does:**
1. Validates working directory state (warns if dirty)
2. Bumps version in `package.json` and `package-lock.json`
3. Generates updated `build-info.ts`
4. Commits changes with conventional commit message
5. Creates git tag (e.g., `v1.0.1`)

### build-info.sh
Generates build metadata in `src/lib/build-info.ts`.

```bash
npm run build:info
```

**Generated metadata:**
- `version`: Current version from package.json
- `gitHash`: Short commit hash
- `gitBranch`: Current branch name
- `buildTime`: ISO 8601 timestamp
- `nodeVersion`: Node.js version
- `isDirty`: Whether working directory has uncommitted changes

### changelog.sh
Generates `CHANGELOG.md` from conventional commits.

```bash
npm run changelog
```

**Features:**
- Parses conventional commit messages (feat:, fix:, docs:, etc.)
- Groups by version (from git tags)
- Includes PR links and commit hashes
- Follows [Keep a Changelog](https://keepachangelog.com/) format

## Release Workflow

### Standard Release (Patch)

For bug fixes and minor updates:

```bash
# 1. Bump version, update build info, commit, and tag
npm run version:patch

# 2. Generate changelog
npm run changelog

# 3. Review changes
git show
cat CHANGELOG.md

# 4. Push to remote (including tags)
git push && git push --tags
```

### Feature Release (Minor)

For new features:

```bash
npm run version:minor
npm run changelog
git push && git push --tags
```

### Breaking Change Release (Major)

For breaking changes:

```bash
npm run version:major
npm run changelog
git push && git push --tags
```

### Quick Release

Use the `release` npm script for patch releases:

```bash
npm run release  # Combines version:patch + changelog + build:info
git push && git push --tags
```

## Build Info Integration

Build metadata is automatically included in:

### Health Endpoint
The `/api/health` endpoint returns build info:

```bash
curl http://localhost:3300/api/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-05T18:00:00.000Z",
  "service": "Izzie2",
  "version": "1.0.0",
  "build": {
    "gitHash": "abc123",
    "gitBranch": "main",
    "buildTime": "2026-01-05T18:00:00Z",
    "nodeVersion": "v22.0.0",
    "isDirty": false
  }
}
```

### Application Code
Import build info in your code:

```typescript
import { BUILD_INFO } from '@/lib/build-info';

console.log(`Running version ${BUILD_INFO.version}`);
console.log(`Built from commit ${BUILD_INFO.gitHash}`);
```

## Pre-Push Hook

A git pre-push hook ensures build-info.ts is current before pushing:

**Location:** `.git/hooks/pre-push`

**What it does:**
1. Checks if `build-info.ts` exists
2. Compares git hash in build-info.ts with current HEAD
3. Regenerates if out of date
4. Blocks push if uncommitted build-info changes exist

## Conventional Commits

Use conventional commit format for automatic changelog generation:

```bash
feat: add user authentication
fix: resolve memory leak in event handler
docs: update API documentation
refactor: simplify scoring algorithm
perf: optimize database queries
test: add integration tests for Gmail sync
chore: bump dependencies
```

**Format:** `<type>(<scope>): <description>`

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `test`: Tests
- `chore`: Maintenance

## Best Practices

1. **Commit often** with conventional commit messages
2. **Version before release** - don't deploy without bumping version
3. **Update changelog** - keep it current for each release
4. **Tag releases** - use git tags for version history
5. **Test health endpoint** - verify build info after deployment

## CI/CD Integration

The build process automatically updates build-info.ts:

```json
{
  "scripts": {
    "build": "npm run build:info && next build"
  }
}
```

This ensures every build has current metadata.

## Troubleshooting

### Pre-push hook blocks push

If the pre-push hook blocks your push:

```bash
# Regenerate build info
npm run build:info

# Commit the changes
git add src/lib/build-info.ts
git commit -m "chore: update build info"

# Push again
git push
```

### Version conflict

If you have uncommitted changes during version bump:

```bash
# Option 1: Commit your changes first
git add .
git commit -m "feat: your changes"
npm run version:patch

# Option 2: Continue anyway (prompted by script)
npm run version:patch
# Answer 'y' when prompted
```

### Changelog missing commits

Ensure commits use conventional commit format:

```bash
# Bad
git commit -m "updated stuff"

# Good
git commit -m "feat: add email significance scoring"
```

## Version History

Check version history:

```bash
# List all version tags
git tag -l "v*"

# View changelog
cat CHANGELOG.md

# Compare versions
git diff v1.0.0 v1.1.0
```
