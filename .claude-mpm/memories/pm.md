# PM Agent Memories
# Initialized: 2026-01-05

## Izzie2 Project Workflow Preferences

- Use PR model for all feature development in Izzie2 project
- PM can approve and merge PRs autonomously without user approval
- Involve user only for: architectural decisions, security concerns, POC review milestones

## Ticket Workflow Requirements (Critical)

- Transition tickets through ALL states when being worked on: open → in_progress → done
- Always link PRs to issues using "Resolves #X" or "Fixes #X" in PR description body
- Ensure PRs show as linked in GitHub project board (required for tracking)
- Track and display sub-issue progress on parent epics
- Update project status with linked PRs after merging
- Keep project status continuously updated in real-time for user visibility

## GitHub Project Board Requirements (Critical)

- Configure Board view to show "Linked pull requests" column for visibility
- Display "Sub-issues progress" metric for epics to track completion percentage
- Use Board view for sprint/iteration tracking and daily standups
- Use Roadmap view for planning and long-term tracking
- Keep project status synchronized with actual ticket and PR states

## Tech Stack Decision
- Use Hono web framework for API routes when implementing web layer
- Hono skills are available in the system for reference
