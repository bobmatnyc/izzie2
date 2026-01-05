# Izzie2 - AI Personal Assistant

Intelligent personal assistant powered by AI, built with Next.js 15 and TypeScript.

## Architecture

Izzie2 uses a multi-agent architecture:

- **Orchestrator Agent** (Claude Opus 4): Main decision-making agent
- **Classifier Agent** (Mistral Large): Event classification and routing
- **Scheduler Agent**: Calendar and scheduling operations
- **Notifier Agent**: Notifications via Telegram

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (strict mode)
- **AI**: OpenRouter (Claude, Mistral)
- **Events**: Inngest
- **Database**: Neon Postgres + Neo4j
- **Validation**: Zod
- **Deployment**: Vercel

## Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your API keys
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   ```

4. **Open [http://localhost:3000](http://localhost:3000)** in your browser.

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── webhooks/      # Webhook endpoints
│   │   └── inngest/       # Inngest function endpoint
│   ├── auth/              # Auth routes
│   └── layout.tsx         # Root layout
├── lib/                   # Shared utilities
│   ├── ai/               # AI/LLM integration
│   ├── events/           # Inngest event definitions
│   └── memory/           # Memory layer
├── agents/               # Agent implementations
│   ├── orchestrator/     # Main orchestrator
│   ├── classifier/       # Event classifier
│   ├── scheduler/        # Calendar scheduler
│   └── notifier/         # Notification agent
└── types/                # TypeScript types
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run type-check` - Check TypeScript types

## API Endpoints

- `/api/health` - Health check endpoint
- `/api/webhooks/github` - GitHub webhook handler
- `/api/webhooks/linear` - Linear webhook handler
- `/api/webhooks/google` - Google Calendar webhook handler
- `/api/inngest` - Inngest function endpoint

## Environment Variables

See `.env.example` for required environment variables:

- `OPENROUTER_API_KEY` - OpenRouter API key
- `DATABASE_URL` - Neon Postgres connection string
- `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` - Neo4j credentials
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` - Inngest credentials
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - Google OAuth
- `TELEGRAM_BOT_TOKEN` - Telegram bot token

## Development Roadmap

- [x] **POC-0**: Project setup (Issue #7)
- [ ] **POC-1**: Basic AI orchestration (Issue #8)
- [ ] **POC-2**: Database integration
- [ ] **POC-3**: Authentication (Better Auth)
- [ ] **POC-4**: Event processing (Inngest)
- [ ] **POC-5**: Memory layer (Mem0)

## License

ISC
