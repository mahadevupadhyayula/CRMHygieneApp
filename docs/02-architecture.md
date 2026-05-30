# Architecture

## Stage 0 Baseline

- Next.js App Router with TypeScript for the web application.
- Prisma as the database access layer placeholder.
- Zod for schema validation contracts.
- Vitest for unit and integration tests.
- Playwright for browser smoke and end-to-end coverage.

## Planned Module Boundaries

- `app/` contains route segments and server/client UI entry points.
- `components/` contains route-independent presentation components.
- `lib/agents/` contains agent orchestration and domain-specific agent modules.
- `lib/crm/` contains CRM provider adapters.
- `lib/ai/` contains AI model/provider abstractions.
- `lib/db/` contains database access helpers.
- `lib/schemas/` contains shared Zod schemas.
