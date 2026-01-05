# Skills Quick Reference Guide

Quick lookup for when to use which skill in the Izzie2 project.

## By Task Type

### Building Features

| Task | Primary Skill | Supporting Skills |
|------|---------------|-------------------|
| API endpoint | `api-design-patterns` | `nodejs-backend`, `api-security-review` |
| React component | `react` | `typescript-core`, `nextjs-core` |
| Next.js route | `nextjs-core` | `nextjs-v16`, `react` |
| Event handler | `nodejs-backend` | `condition-based-waiting` |
| AI integration | `openrouter` | `anthropic-sdk`, `langchain` |
| Data validation | `zod` | `typescript-core` |
| Graph queries | `graphql` | Neo4j driver docs |

### Testing

| Task | Primary Skill | Supporting Skills |
|------|---------------|-------------------|
| Unit tests | `vitest` | `test-driven-development` |
| Integration tests | `vitest` | `api-design-patterns` |
| E2E tests | `playwright` | `webapp-testing` |
| Fix verification | `bug-fix-verification` | `verification-before-completion` |
| Pre-commit checks | `pre-merge-verification` | `vitest` |

### Debugging

| Task | Primary Skill | Supporting Skills |
|------|---------------|-------------------|
| Bug investigation | `systematic-debugging` | `root-cause-tracing` |
| Performance issues | `web-performance-optimization` | `nextjs-v16` |
| API errors | `api-design-patterns` | `nodejs-backend` |
| AI prompt issues | `openrouter` | `session-compression` |
| Event failures | `nodejs-backend` | `condition-based-waiting` |

### Infrastructure

| Task | Primary Skill | Supporting Skills |
|------|---------------|-------------------|
| Docker setup | `docker` | `env-manager` |
| CI/CD pipeline | `github-actions` | `pre-merge-verification` |
| Deployment | `vercel-overview` | `env-manager` |
| Environment vars | `env-manager` | Security best practices |

### Code Quality

| Task | Primary Skill | Supporting Skills |
|------|---------------|-------------------|
| Code review | `pr-quality-checklist` | `requesting-code-review` |
| Refactoring | `software-patterns` | `typescript-core` |
| Linting/formatting | `biome` | Project conventions |
| Security review | `api-security-review` | `api-design-patterns` |

## By Technology

### Next.js 16

**Skills**: `nextjs`, `nextjs-core`, `nextjs-v16`

Use for:
- Routing (App Router)
- Server Components
- Cache components
- Partial Prerendering (PPR)
- Middleware
- API routes

### React 19

**Skills**: `react`

Use for:
- Hooks
- Server Components
- Server Actions
- Context
- Suspense

### TypeScript 5.9

**Skills**: `typescript-core`

Use for:
- Type safety
- Generics
- Strict mode patterns
- Advanced types

### OpenRouter / Claude

**Skills**: `openrouter`, `anthropic-sdk`, `langchain`

Use for:
- Model selection
- Prompt engineering
- Cost optimization
- Structured outputs
- Agent orchestration

### Inngest

**Skills**: `nodejs-backend`, `express-production`

Use for:
- Event handlers
- Async workflows
- Error handling
- Retries

### Vitest 4.0

**Skills**: `vitest`, `test-driven-development`, `testing-anti-patterns`

Use for:
- Unit tests
- Integration tests
- Mocking
- Coverage

### Playwright

**Skills**: `playwright`

Use for:
- E2E tests
- Browser automation
- Visual testing

### Zod

**Skills**: `zod`, `typescript-core`

Use for:
- Input validation
- Schema definition
- Type inference
- API contracts

## By Problem Type

### "Tests are flaky"
1. Check `testing-anti-patterns`
2. Use `condition-based-waiting` instead of sleep
3. Review `vitest` for proper async handling

### "API is slow"
1. Review `web-performance-optimization`
2. Check `api-design-patterns` for caching
3. Review `nextjs-v16` for cache components

### "AI responses are inconsistent"
1. Review `openrouter` for model selection
2. Check `anthropic-sdk` for structured outputs
3. Use `session-compression` for context management

### "Event handler failing"
1. Review `nodejs-backend` for error handling
2. Check `condition-based-waiting` for retry logic
3. Review Inngest documentation

### "TypeScript errors"
1. Review `typescript-core` for type patterns
2. Check `zod` for runtime validation
3. Review `react` for component typing

### "Security concern"
1. Review `api-security-review`
2. Check `api-design-patterns` for auth
3. Review `env-manager` for secrets

## Command Reference

```bash
# View all skills
claude-mpm skills list

# View specific skill
claude-mpm skills show <skill-name>

# Add missing skill
claude-mpm skills add <skill-name>

# Validate configuration
claude-mpm config validate

# List deployed agents
claude-mpm agents list

# Check agent preferences
cat .claude-mpm/configuration.yaml | grep -A 5 agent_preferences
```

## Skill Categories

### Essential (Always Active)
- `typescript-core`
- `nextjs-core`
- `react`
- `vitest`
- `verification-before-completion`

### AI-Specific
- `openrouter`
- `anthropic-sdk`
- `mcp`
- `langchain`

### Backend
- `nodejs-backend`
- `express-production`
- `api-design-patterns`

### Quality
- `test-driven-development`
- `testing-anti-patterns`
- `bug-fix-verification`
- `systematic-debugging`

### Infrastructure
- `docker`
- `github-actions`
- `vercel-overview`
- `env-manager`

## When to Add More Skills

Add skills when:

1. **New technology added**
   - Added TailwindCSS? Add `tailwind` skill
   - Added Prisma? Add `prisma-orm` skill

2. **New pattern needed**
   - State management? Add `zustand` or `tanstack-query`
   - API layer? Add `trpc` skill

3. **Team request**
   - Someone needs Django? Add `django` skill
   - Someone needs Vue? Add `vue` skill

4. **Performance optimization**
   - Need specific optimization? Add relevant skill

Don't add skills "just in case" - keep the list lean and relevant.

## Skill Removal Criteria

Remove skills when:

1. **Dependency removed**
   - Removed framework
   - Switched to alternative

2. **Not used in 3 months**
   - Check git history
   - Ask team

3. **Superseded by better skill**
   - Newer version available
   - More comprehensive skill exists

---

**Last Updated**: 2025-01-05
**For**: Izzie2 Project
**Skills Count**: 40
