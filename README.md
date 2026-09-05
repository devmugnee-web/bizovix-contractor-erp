# Bizovix Contractor ERP

Desktop and SaaS ERP platform for contractors — bank instruments, tender management,
expenses, receipts, and reporting. Electron desktop shell wrapping a Next.js UI backed by
a NestJS REST API, Prisma, and PostgreSQL, in a Turborepo/pnpm monorepo.

## Stack

- **Desktop shell**: Electron
- **UI**: Next.js (App Router), Tailwind CSS, Recharts, Lucide icons
- **API**: NestJS, class-validator, Passport JWT
- **Data**: Prisma, PostgreSQL
- **Monorepo**: pnpm workspaces + Turborepo
- **Language**: TypeScript everywhere

## Monorepo layout

```
apps/
  api/               NestJS REST API (/api/v1)
  desktop/
    electron/        Electron main process + preload
    renderer/         Next.js UI
packages/
  database/          Prisma schema, migrations, seed
  types/             Shared TypeScript types/enums
  validation/        Shared Zod schemas (mirrors API DTOs)
  api-client/        Typed fetch client + TanStack Query hooks
  ui/                Shared design-system components
  utils/             Shared formatters (currency, date, pagination)
  config/            Shared TypeScript/Tailwind configs
docker/              Dockerfile(s) for containerized deployment
```

## Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- A local PostgreSQL 14+ instance (or use `docker compose up postgres`)

## First-time setup

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Create the database and a dedicated role** (skip if using `docker compose up postgres`)

   ```sql
   CREATE ROLE bizovix WITH LOGIN PASSWORD 'bizovix_dev_local' CREATEDB;
   CREATE DATABASE bizovix_contractor_erp_db OWNER bizovix;
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Fill in `DATABASE_URL` (matching the role/password from step 2) and generate values for
   `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`, e.g.:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

4. **Run migrations and seed demo data**

   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```

   Seeds a default organization, an Admin role with every permission, and a demo user:

   ```
   email:    admin@bizovix.com
   password: Admin@123
   ```

5. **Build the shared packages** (required once before the API/renderer can resolve their
   compiled output)

   ```bash
   pnpm build --filter=./packages/*
   ```

## Running in development

Start the browser ERP stack (API + renderer) from the repository root:

```bash
pnpm dev
```

The same services can also be started in separate terminals when debugging them individually:

```bash
pnpm --filter @bizovix/api dev        # http://localhost:4000/api/v1
pnpm --filter @bizovix/renderer dev   # http://localhost:3010
```

Then launch the Electron shell, which points at the running renderer dev server:

```bash
pnpm --filter @bizovix/electron dev
```

Or open `http://localhost:3010` directly in a browser — the app works the same way outside
Electron since all business logic lives behind the REST API.

## Useful scripts (from the repo root)

| Command | Description |
| --- | --- |
| `pnpm dev` | Reuse healthy local services and start only the missing API/renderer |
| `pnpm dev:turbo` | Force the original API + renderer Turborepo dev tasks |
| `pnpm dev:electron` | Launch the Electron shell after the web stack is running |
| `pnpm dev:all` | Run every app's `dev` script, including Electron |
| `pnpm build` | Build every app/package |
| `pnpm lint` | Lint every app/package |
| `pnpm typecheck` | Type-check every app/package |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:seed` | Seed demo data |
| `pnpm db:studio` | Open Prisma Studio |

## Docker (API + PostgreSQL)

A `docker-compose.yml` is provided for containerized deployment of the API and database.
It is **not required for local development** — the app runs against a native PostgreSQL
install and `pnpm dev` just fine.

```bash
docker compose up -d postgres     # start just the database
docker compose up -d              # start database + API
```

Set `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET` in your shell
environment (or a `.env` file next to `docker-compose.yml`) before running it.

## Architecture notes

- **Multi-tenant**: every business record carries an `organizationId`; all API queries are
  scoped to the authenticated user's organization.
- **RBAC**: permissions are seeded as a fixed catalog (`document_purchase.create`, etc.) and
  attached to roles via a join table; the API enforces them with a `PermissionsGuard` and a
  `@RequirePermissions(...)` decorator.
- **Auth**: JWT access + refresh tokens; refresh tokens are hashed and stored server-side for
  revocation on logout/rotation.
- **Scope of this milestone**: Dashboard and Document Purchase are fully wired end-to-end
  (DB → API → UI). Other sidebar modules (Tender Security, CMS, Expenses, Reports, etc.)
  have navigation and route stubs but not full CRUD yet.
