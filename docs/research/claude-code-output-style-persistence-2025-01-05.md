# Claude Code Output Style Persistence Issue Investigation

**Date**: 2025-01-05
**Investigator**: Research Agent
**Issue**: `/output-style` command sets "Claude MPM" but status bar shows "style:default"

---

## Executive Summary

**Root Cause**: Case-sensitivity mismatch between global config and project-level config.

- **Global config** (`~/.claude/settings.json`): Uses `"activeOutputStyle": "claude-mpm"` (lowercase with hyphen)
- **Project config** (`./.claude/settings.local.json`): Uses `"outputStyle": "Claude MPM"` (Title Case with space)
- **Output style file names**: Defined in markdown frontmatter with `name:` field

**Impact**: Settings appear to change when using `/output-style` command, but status bar continues showing `style:default` because the active style lookup fails due to name mismatch.

**Fix**: Ensure both global and project-level settings use the same exact string that matches the output style's `name:` field.

---

## Investigation Findings

### 1. Configuration File Locations

Claude Code maintains output style settings at two levels:

#### Global Settings
**Location**: `/Users/masa/.claude/settings.json`

```json
{
  "activeOutputStyle": "claude-mpm",
  // ... other settings
}
```

#### Project-Level Settings
**Location**: `/Users/masa/Projects/izzie2/.claude/settings.local.json`

```json
{
  "outputStyle": "Claude MPM"
}
```

### 2. Output Style File Definitions

Output styles are defined in markdown files with YAML frontmatter:

**Global output styles directory**: `/Users/masa/.claude/output-styles/`
**Project-level overrides**: `/Users/masa/.claude/settings/output-styles/`

Example from `/Users/masa/.claude/output-styles/claude-mpm.md`:

```markdown
---
name: Claude MPM
description: Multi-Agent Project Manager orchestration mode with mandatory delegation
---
```

### 3. The Mismatch Problem

**Global Config Reference**: `"claude-mpm"` (lowercase, hyphenated)
**Project Config Reference**: `"Claude MPM"` (Title Case, space-separated)
**Actual Style Name**: `"Claude MPM"` (from markdown frontmatter `name:` field)

The status bar reads the active output style and attempts to display it:

```bash
# Status line command from settings.json
style=$(echo "$input" | jq -r '.output_style.name // "default"')
```

When the style lookup fails due to name mismatch, it falls back to `"default"`.

### 4. Settings Hierarchy

Claude Code applies settings in this priority order:

1. **Project-level settings** (`./.claude/settings.local.json`) - HIGHEST PRIORITY
2. **Global settings** (`~/.claude/settings.json`)
3. **Default settings** (built-in fallbacks)

However, the **naming must be consistent** across all levels for the style to load correctly.

### 5. Available Output Styles

#### Global Output Styles (`~/.claude/output-styles/`)
1. `claude-mpm.md` → `name: Claude MPM`
2. `claude-mpm-teacher.md` → `name: Claude MPM Teacher`

#### Project-Level Output Styles (`~/.claude/settings/output-styles/`)
1. `claude-mpm-style.md` → `name: Claude MPM`
2. `claude-mpm-teacher.md` → `name: Claude MPM Teacher`
3. `claude-mpm-teacher-test.md` → `name: Claude MPM Teacher`

### 6. Status Bar Configuration

The status bar is configured in `/Users/masa/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "input=$(cat); dir=$(echo \"$input\" | jq -r '.workspace.current_dir'); model=$(echo \"$input\" | jq -r '.model.display_name'); style=$(echo \"$input\" | jq -r '.output_style.name // \"default\"'); dir_name=$(basename \"$dir\"); git_info=\"\"; if git -C \"$dir\" rev-parse --git-dir > /dev/null 2>&1; then branch=$(git -C \"$dir\" -c core.useBuiltinFSMonitor=false rev-parse --abbrev-ref HEAD 2>/dev/null); [ -n \"$branch\" ] && git_info=\" | git:$branch\"; fi; printf \"\\033[2m%s%s | %s | style:%s\\033[0m\" \"$dir_name\" \"$git_info\" \"$model\" \"$style\""
  }
}
```

This command receives JSON input with the current output style and displays it. If the style lookup fails, it defaults to `"default"`.

### 7. How `/output-style` Command Works

The `/output-style` command likely:
1. Updates the `activeOutputStyle` or `outputStyle` setting
2. Attempts to load the corresponding markdown file
3. Fails silently if the name doesn't match any available styles
4. Falls back to default behavior

---

## Solution Strategies

### Strategy 1: Fix Project-Level Setting (Recommended)

**Action**: Update `./.claude/settings.local.json` to use the exact name from the output style file.

**Current** (`./.claude/settings.local.json`):
```json
{
  "outputStyle": "Claude MPM"
}
```

**Should match either**:
- The global setting: `"claude-mpm"`
- OR the style name: `"Claude MPM"`

**Test**:
```bash
# Verify which name format Claude Code expects
cat ~/.claude/settings.json | jq -r '.activeOutputStyle'
# Output: claude-mpm
```

**Fix Option A** - Match global format (lowercase):
```json
{
  "outputStyle": "claude-mpm"
}
```

**Fix Option B** - Match style name (Title Case):
Update global setting to:
```json
{
  "activeOutputStyle": "Claude MPM"
}
```

### Strategy 2: Verify Style File Naming

Ensure the markdown filename can be resolved to the style name. Claude Code may:
- Use the filename (e.g., `claude-mpm.md` → `"claude-mpm"`)
- OR use the frontmatter `name:` field (e.g., `name: Claude MPM`)

### Strategy 3: Check Style Loading Order

Claude Code may prioritize:
1. Project-level styles (`~/.claude/settings/output-styles/`)
2. Global styles (`~/.claude/output-styles/`)

If both exist with different `name:` fields, conflicts may occur.

### Strategy 4: Delete Conflicting Files

**Problem**: Multiple files with the same `name:` field but different filenames:
- `~/.claude/output-styles/claude-mpm.md` → `name: Claude MPM`
- `~/.claude/settings/output-styles/claude-mpm-style.md` → `name: Claude MPM`

**Solution**: Keep only one canonical version.

---

## Recommended Fix (Step-by-Step)

### Step 1: Standardize on One Naming Convention

**Decision**: Use the frontmatter `name:` field as the canonical identifier.

For `"Claude MPM"` style:
- Frontmatter: `name: Claude MPM` (Title Case with space)
- File reference: `"Claude MPM"`

### Step 2: Update Global Settings

Edit `~/.claude/settings.json`:

```json
{
  "activeOutputStyle": "Claude MPM",
  // ... rest of settings
}
```

### Step 3: Update Project Settings

Edit `./.claude/settings.local.json`:

```json
{
  "outputStyle": "Claude MPM"
}
```

### Step 4: Consolidate Duplicate Output Style Files

Remove redundant files. Keep only:

**Global**: `~/.claude/output-styles/claude-mpm.md`
**Project**: Remove `~/.claude/settings/output-styles/claude-mpm-style.md` (redundant)

### Step 5: Restart Claude Code

After making changes:
```bash
# Exit Claude Code and restart
# Or reload configuration if available
```

### Step 6: Verify

```bash
# Check status bar shows: style:Claude MPM
# NOT: style:default
```

---

## Alternative Fix: Lowercase Convention

If Claude Code internally uses kebab-case (lowercase with hyphens), standardize on that:

### Update Frontmatter
Edit `~/.claude/output-styles/claude-mpm.md`:

```markdown
---
name: claude-mpm
description: Multi-Agent Project Manager orchestration mode with mandatory delegation
---
```

### Update Settings
Both global and project settings:

```json
{
  "activeOutputStyle": "claude-mpm",  // global
  "outputStyle": "claude-mpm"          // project
}
```

---

## Testing Protocol

1. **Update settings** (choose one strategy above)
2. **Restart Claude Code** completely
3. **Check status bar**: Should show `style:Claude MPM` (or `style:claude-mpm`)
4. **Run `/output-style` command** and verify it persists
5. **Open new session** and verify style is still active

---

## Additional Observations

### Status Bar Command Fallback
The status bar command has a fallback mechanism:
```bash
style=$(echo "$input" | jq -r '.output_style.name // "default"')
```

If `.output_style.name` is null or undefined, it defaults to `"default"`. This explains why the user sees `style:default` when the style lookup fails.

### Hook Integration
The project uses extensive hooks (`claude-mpm` integration):
```json
{
  "hooks": {
    "PreToolUse": [...],
    "PostToolUse": [...],
    "UserPromptSubmit": [...],
    "Stop": [...],
    "SubagentStop": [...],
    "SubagentStart": [...],
    "SessionStart": [...]
  }
}
```

These hooks may interact with output style loading. Verify hooks don't override or clear the output style setting.

---

## Conclusion

**Root Cause**: Inconsistent naming between global config (`claude-mpm`), project config (`Claude MPM`), and output style files (`name: Claude MPM`).

**Fix**: Standardize all references to use the exact same string - preferably the `name:` field from the markdown frontmatter.

**Recommended**: Use `"Claude MPM"` (Title Case with space) across all settings to match the frontmatter `name:` field.

**Next Steps**:
1. Update `/Users/masa/.claude/settings.json` → `"activeOutputStyle": "Claude MPM"`
2. Verify `./.claude/settings.local.json` → `"outputStyle": "Claude MPM"`
3. Restart Claude Code
4. Verify status bar shows `style:Claude MPM`

---

## References

- Global settings: `/Users/masa/.claude/settings.json`
- Project settings: `/Users/masa/Projects/izzie2/.claude/settings.local.json`
- Global output styles: `/Users/masa/.claude/output-styles/`
- Project output styles: `/Users/masa/.claude/settings/output-styles/`
- Status bar configuration: In global `settings.json`
