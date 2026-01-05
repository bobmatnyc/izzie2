# Claude MPM Configuration - Izzie2

Optimized Claude MPM configuration for the Izzie2 AI email intelligence project.

## Quick Links

- **[Skills Reference](./project-skills.md)** - What each skill does and when to use it
- **[Quick Reference](./SKILLS_QUICK_REFERENCE.md)** - Fast lookup by task/technology
- **[Optimization Summary](./OPTIMIZATION_SUMMARY.md)** - What changed and why
- **[Migration Guide](./MIGRATION_GUIDE.md)** - Adapting to new configuration

## Configuration Overview

**Optimized**: 2025-01-05
**Skills**: 40 (reduced from 130+)
**Reduction**: 70%
**Status**: Production-ready

### Project Stack

- **Framework**: Next.js 16, React 19
- **Language**: TypeScript 5.9 (strict mode)
- **Testing**: Vitest 4.0, Playwright
- **AI**: OpenRouter (Claude, Mistral), LangChain patterns
- **Events**: Inngest
- **Data**: Neo4j, Neon Postgres, Zod
- **APIs**: Google (Gmail, Drive), Telegram
- **Infrastructure**: Docker, Vercel, GitHub Actions

## Skills Breakdown

### By Category

```
Core Framework:       5 skills  (Next.js 16, React 19, TypeScript)
Testing & Quality:    7 skills  (Vitest, Playwright, TDD)
AI Integration:       5 skills  (OpenRouter, Claude, MCP)
Event-Driven:         2 skills  (Inngest, Node.js backend)
Data & Validation:    3 skills  (Zod, GraphQL, Pydantic)
Infrastructure:       4 skills  (Docker, CI/CD, Vercel)
Code Quality:         4 skills  (Biome, debugging, Git)
Best Practices:       4 skills  (API design, patterns, security)
Collaboration:        5 skills  (PRs, reviews, planning)
Specialized:          4 skills  (JSON, async patterns, compression)
---
Total:               40 skills
```

### By Priority

**Critical (Always Used)**:
- nextjs-v16, react, typescript-core
- vitest, verification-before-completion
- zod, api-design-patterns

**High (Frequently Used)**:
- openrouter, anthropic-sdk
- nodejs-backend, express-production
- playwright, test-driven-development
- biome, systematic-debugging

**Medium (As Needed)**:
- mcp, mcp-builder, langchain
- docker, github-actions
- git-workflow, git-worktrees
- pr-quality-checklist

**Low (Specialized)**:
- session-compression
- condition-based-waiting
- root-cause-tracing
- json-data-handling

## Agent Preferences

Optimized agent selection for this project:

```yaml
primary_engineer: typescript-engineer    # TypeScript is primary
primary_qa: api-qa                       # API-first testing
primary_ops: vercel-ops                  # Vercel deployment
ai_specialist: openrouter-engineer       # LLM integration
event_specialist: nodejs-backend         # Inngest events
```

## Files in This Directory

### Configuration
- `configuration.yaml` - Main configuration (optimized)
- `.env.example` - Environment variables template

### Documentation
- `README.md` - This file (overview)
- `project-skills.md` - Detailed skill documentation
- `SKILLS_QUICK_REFERENCE.md` - Quick lookup guide
- `OPTIMIZATION_SUMMARY.md` - What changed
- `MIGRATION_GUIDE.md` - Migration instructions

### Memory & State
- `memories/` - Agent memory storage
- `deployed-agents.json` - Active agents (auto-generated)
- `PM_INSTRUCTIONS.md` - Project Manager instructions

## Common Tasks

### View Skills

```bash
# List all skills
claude-mpm skills list

# Show specific skill details
claude-mpm skills show nextjs-v16

# Search for skills
claude-mpm skills search "testing"
```

### Manage Skills

```bash
# Add a skill
claude-mpm skills add tailwind

# Remove a skill
claude-mpm skills remove svelte

# Validate configuration
claude-mpm config validate
```

### Agent Management

```bash
# List agents
claude-mpm agents list

# Deploy agent
claude-mpm agents deploy typescript-engineer

# Check agent status
claude-mpm agents status
```

### Configuration

```bash
# Validate configuration
claude-mpm config validate

# Show current config
claude-mpm config show

# Reload configuration
claude-mpm config reload
```

## Quick Reference

### For Engineers

**Building a feature**:
1. Check `SKILLS_QUICK_REFERENCE.md` for relevant skills
2. Use `typescript-core` + `nextjs-v16` + `react`
3. Follow `api-design-patterns` for APIs
4. Validate with `zod`
5. Test with `vitest`

### For QA

**Testing a feature**:
1. Use `vitest` for unit/integration tests
2. Use `playwright` for E2E tests
3. Follow `test-driven-development` practices
4. Check `testing-anti-patterns` to avoid mistakes
5. Verify with `bug-fix-verification`

### For Ops

**Deploying**:
1. Use `docker` for containerization
2. Use `github-actions` for CI/CD
3. Deploy to Vercel with `vercel-overview`
4. Manage secrets with `env-manager`
5. Monitor and debug with `systematic-debugging`

### For AI Work

**AI Integration**:
1. Use `openrouter` for model routing
2. Use `anthropic-sdk` for Claude-specific features
3. Use `langchain` for agent orchestration
4. Build MCP servers with `mcp-builder`
5. Manage context with `session-compression`

## When to Update This Configuration

### Add Skills When:
- Adding new major dependencies
- Adopting new frameworks
- Team needs new capabilities
- New patterns emerge

### Remove Skills When:
- Removing dependencies
- Switching frameworks
- Skills unused for 3+ months
- Better alternatives exist

### Review Quarterly:
1. Audit `package.json` dependencies
2. Compare to active skills
3. Add missing, remove obsolete
4. Update documentation

## Validation Checklist

Before committing configuration changes:

- [ ] Configuration validates: `claude-mpm config validate`
- [ ] Skills count reasonable (30-50 for this project)
- [ ] All skills relevant to project stack
- [ ] Agent preferences match project needs
- [ ] Documentation updated
- [ ] Changes documented in `OPTIMIZATION_SUMMARY.md`
- [ ] Migration notes added if needed

## Performance Expectations

### Startup Performance
- Skills loading: < 2 seconds
- Agent initialization: < 1 second
- Configuration validation: < 500ms

### Runtime Performance
- Skill lookup: Instant
- Agent selection: < 100ms
- Context loading: < 1 second

### Memory Usage
- Configuration: ~50KB
- Skills cache: ~2MB
- Total overhead: < 5MB

## Troubleshooting

### Skills Not Loading

```bash
# Clear cache
claude-mpm cache clear

# Reload configuration
claude-mpm config reload

# Validate
claude-mpm config validate
```

### Agent Not Found

```bash
# List available agents
claude-mpm agents list

# Check agent preferences
grep -A 5 "agent_preferences" configuration.yaml

# Verify agent exists in cache
ls -la ~/.claude-mpm/cache/agents/
```

### Configuration Invalid

```bash
# Validate YAML syntax
claude-mpm config validate

# Check for typos in skill names
claude-mpm skills list | grep <skill-name>

# Restore from backup
cp configuration.yaml.bak configuration.yaml
```

## Support

- **Documentation**: See files in this directory
- **Logs**: `~/.claude-mpm/logs/`
- **Cache**: `~/.claude-mpm/cache/`
- **Issues**: Report in project repository

## Version History

### 2.0 (2025-01-05) - Optimized
- Reduced skills from 130+ to 40 (70% reduction)
- Added agent preferences
- Created comprehensive documentation
- Organized skills by category

### 1.0 (Initial)
- Auto-generated configuration
- 130+ skills (many irrelevant)
- No agent preferences
- Minimal documentation

---

**Maintained by**: Izzie2 Development Team
**Last Updated**: 2025-01-05
**Configuration Version**: 2.0
