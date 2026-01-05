#!/bin/bash

# Semantic versioning script for Izzie2
# Usage: ./scripts/version.sh [patch|minor|major]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validate input
if [ $# -ne 1 ]; then
  echo -e "${RED}Error: Version type required${NC}"
  echo "Usage: $0 [patch|minor|major]"
  exit 1
fi

VERSION_TYPE=$1

if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo -e "${RED}Error: Invalid version type '$VERSION_TYPE'${NC}"
  echo "Valid types: patch, minor, major"
  exit 1
fi

# Check if working directory is clean
if [[ -n $(git status -s) ]]; then
  echo -e "${YELLOW}Warning: Working directory is not clean${NC}"
  echo "Uncommitted changes:"
  git status -s
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}Current version: ${CURRENT_VERSION}${NC}"

# Calculate new version
IFS='.' read -r -a VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR=${VERSION_PARTS[0]}
MINOR=${VERSION_PARTS[1]}
PATCH=${VERSION_PARTS[2]}

case $VERSION_TYPE in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
esac

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
echo -e "${GREEN}New version: ${NEW_VERSION}${NC}"

# Update package.json
npm version $NEW_VERSION --no-git-tag-version

# Generate build info
echo -e "${YELLOW}Generating build info...${NC}"
./scripts/build-info.sh

# Commit changes
git add package.json package-lock.json src/lib/build-info.ts
git commit -m "chore: bump version to ${NEW_VERSION}"

# Create git tag
git tag -a "v${NEW_VERSION}" -m "Release version ${NEW_VERSION}"

echo -e "${GREEN}✓ Version bumped to ${NEW_VERSION}${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Review the changes: git show"
echo "  2. Push to remote: git push && git push --tags"
echo "  3. Generate changelog: npm run changelog"
