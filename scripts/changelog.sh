#!/bin/bash

# Generate CHANGELOG.md from conventional commits
# Parses git history and groups by version

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

OUTPUT_FILE="CHANGELOG.md"
REPO_URL=$(git config --get remote.origin.url | sed 's/\.git$//')

# Convert git URL to https format for GitHub
if [[ $REPO_URL == git@github.com:* ]]; then
  REPO_URL=$(echo $REPO_URL | sed 's|git@github.com:|https://github.com/|')
fi

echo -e "${YELLOW}Generating changelog...${NC}"

# Start changelog
cat > $OUTPUT_FILE << 'EOF'
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

EOF

# Get all tags sorted by version
TAGS=$(git tag -l "v*" --sort=-version:refname 2>/dev/null || echo "")

# If no tags exist, create an "Unreleased" section with recent commits
if [ -z "$TAGS" ]; then
  echo "## [Unreleased]" >> $OUTPUT_FILE
  echo "" >> $OUTPUT_FILE

  # Get last 50 commits and group by type
  git log --pretty=format:"%s|||%h|||%aI" -50 | while IFS='|||' read -r message hash date; do
    if [[ $message =~ ^feat(\(.+\))?: ]]; then
      echo "### Features" >> $OUTPUT_FILE.tmp
      DESC=$(echo "$message" | sed -E 's/^feat(\(.+\))?: //')
      echo "- $DESC [\`$hash\`]($REPO_URL/commit/$hash)" >> $OUTPUT_FILE.tmp
      echo "" >> $OUTPUT_FILE.tmp
    elif [[ $message =~ ^fix(\(.+\))?: ]]; then
      echo "### Bug Fixes" >> $OUTPUT_FILE.tmp
      DESC=$(echo "$message" | sed -E 's/^fix(\(.+\))?: //')
      echo "- $DESC [\`$hash\`]($REPO_URL/commit/$hash)" >> $OUTPUT_FILE.tmp
      echo "" >> $OUTPUT_FILE.tmp
    elif [[ $message =~ ^docs(\(.+\))?: ]]; then
      echo "### Documentation" >> $OUTPUT_FILE.tmp
      DESC=$(echo "$message" | sed -E 's/^docs(\(.+\))?: //')
      echo "- $DESC [\`$hash\`]($REPO_URL/commit/$hash)" >> $OUTPUT_FILE.tmp
      echo "" >> $OUTPUT_FILE.tmp
    fi
  done

  # Append temporary file if it exists
  if [ -f $OUTPUT_FILE.tmp ]; then
    cat $OUTPUT_FILE.tmp >> $OUTPUT_FILE
    rm $OUTPUT_FILE.tmp
  fi
else
  # Process each version
  PREVIOUS_TAG=""
  for TAG in $TAGS; do
    VERSION=${TAG#v}
    TAG_DATE=$(git log -1 --format=%aI $TAG | cut -d'T' -f1)
    echo "## [$VERSION] - $TAG_DATE" >> $OUTPUT_FILE
    echo "" >> $OUTPUT_FILE

    # Get commits for this version
    if [ -z "$PREVIOUS_TAG" ]; then
      RANGE="$TAG"
    else
      RANGE="$TAG...$PREVIOUS_TAG"
    fi

    # Temporary files for each section
    FEAT_FILE=$(mktemp)
    FIX_FILE=$(mktemp)
    DOCS_FILE=$(mktemp)
    REFACTOR_FILE=$(mktemp)
    PERF_FILE=$(mktemp)
    TEST_FILE=$(mktemp)
    CHORE_FILE=$(mktemp)

    # Parse commits
    git log $RANGE --pretty=format:"%s|||%h" --reverse | while IFS='|||' read -r message hash; do
      # Extract PR number if present
      PR=""
      if [[ $message =~ \(#([0-9]+)\) ]]; then
        PR_NUM="${BASH_REMATCH[1]}"
        PR=" ([#$PR_NUM]($REPO_URL/pull/$PR_NUM))"
      fi

      if [[ $message =~ ^feat(\(.+\))?: ]]; then
        DESC=$(echo "$message" | sed -E 's/^feat(\(.+\))?: //' | sed -E 's/ \(#[0-9]+\)$//')
        echo "- $DESC$PR [\`$hash\`]($REPO_URL/commit/$hash)" >> $FEAT_FILE
      elif [[ $message =~ ^fix(\(.+\))?: ]]; then
        DESC=$(echo "$message" | sed -E 's/^fix(\(.+\))?: //' | sed -E 's/ \(#[0-9]+\)$//')
        echo "- $DESC$PR [\`$hash\`]($REPO_URL/commit/$hash)" >> $FIX_FILE
      elif [[ $message =~ ^docs(\(.+\))?: ]]; then
        DESC=$(echo "$message" | sed -E 's/^docs(\(.+\))?: //' | sed -E 's/ \(#[0-9]+\)$//')
        echo "- $DESC$PR [\`$hash\`]($REPO_URL/commit/$hash)" >> $DOCS_FILE
      elif [[ $message =~ ^refactor(\(.+\))?: ]]; then
        DESC=$(echo "$message" | sed -E 's/^refactor(\(.+\))?: //' | sed -E 's/ \(#[0-9]+\)$//')
        echo "- $DESC$PR [\`$hash\`]($REPO_URL/commit/$hash)" >> $REFACTOR_FILE
      elif [[ $message =~ ^perf(\(.+\))?: ]]; then
        DESC=$(echo "$message" | sed -E 's/^perf(\(.+\))?: //' | sed -E 's/ \(#[0-9]+\)$//')
        echo "- $DESC$PR [\`$hash\`]($REPO_URL/commit/$hash)" >> $PERF_FILE
      elif [[ $message =~ ^test(\(.+\))?: ]]; then
        DESC=$(echo "$message" | sed -E 's/^test(\(.+\))?: //' | sed -E 's/ \(#[0-9]+\)$//')
        echo "- $DESC$PR [\`$hash\`]($REPO_URL/commit/$hash)" >> $TEST_FILE
      elif [[ $message =~ ^chore(\(.+\))?: ]]; then
        DESC=$(echo "$message" | sed -E 's/^chore(\(.+\))?: //' | sed -E 's/ \(#[0-9]+\)$//')
        echo "- $DESC$PR [\`$hash\`]($REPO_URL/commit/$hash)" >> $CHORE_FILE
      fi
    done

    # Append sections if they have content
    if [ -s $FEAT_FILE ]; then
      echo "### Features" >> $OUTPUT_FILE
      cat $FEAT_FILE >> $OUTPUT_FILE
      echo "" >> $OUTPUT_FILE
    fi

    if [ -s $FIX_FILE ]; then
      echo "### Bug Fixes" >> $OUTPUT_FILE
      cat $FIX_FILE >> $OUTPUT_FILE
      echo "" >> $OUTPUT_FILE
    fi

    if [ -s $PERF_FILE ]; then
      echo "### Performance Improvements" >> $OUTPUT_FILE
      cat $PERF_FILE >> $OUTPUT_FILE
      echo "" >> $OUTPUT_FILE
    fi

    if [ -s $REFACTOR_FILE ]; then
      echo "### Code Refactoring" >> $OUTPUT_FILE
      cat $REFACTOR_FILE >> $OUTPUT_FILE
      echo "" >> $OUTPUT_FILE
    fi

    if [ -s $DOCS_FILE ]; then
      echo "### Documentation" >> $OUTPUT_FILE
      cat $DOCS_FILE >> $OUTPUT_FILE
      echo "" >> $OUTPUT_FILE
    fi

    if [ -s $TEST_FILE ]; then
      echo "### Tests" >> $OUTPUT_FILE
      cat $TEST_FILE >> $OUTPUT_FILE
      echo "" >> $OUTPUT_FILE
    fi

    if [ -s $CHORE_FILE ]; then
      echo "### Chores" >> $OUTPUT_FILE
      cat $CHORE_FILE >> $OUTPUT_FILE
      echo "" >> $OUTPUT_FILE
    fi

    # Cleanup temp files
    rm -f $FEAT_FILE $FIX_FILE $DOCS_FILE $REFACTOR_FILE $PERF_FILE $TEST_FILE $CHORE_FILE

    PREVIOUS_TAG=$TAG
  done
fi

echo -e "${GREEN}✓ Changelog generated: $OUTPUT_FILE${NC}"
