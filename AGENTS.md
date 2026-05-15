# Repository Guidelines

## Project Structure & Module Organization

Phywise is a pnpm/Turbo monorepo with a Python API. `apps/web` contains the Next.js 16/React 19 student workspace, with routes in `app/`, UI in `components/`, and app helpers in `lib/`. `apps/api` contains the FastAPI service in `src/phywise_api` and pytest tests in `tests/`. Shared TypeScript packages live in `packages/contracts`, `packages/domain`, `packages/whiteboard-schema`, and `packages/design-tokens`. Formal product, architecture, and engineering docs are under `docs/`. Local database and asset output default to `storage/`.

## Build, Test, and Development Commands

- `pnpm install`: install Node workspace dependencies.
- `python -m pip install -e "apps/api[dev]"`: install the API package plus test dependencies.
- `pnpm dev:web`: run the Next.js development server.
- `pnpm dev:api`: run FastAPI with Uvicorn on port `8000`.
- `pnpm typecheck`: run Turbo TypeScript checks across apps and packages.
- `python -m pytest apps/api/tests -q`: run API tests.
- `pnpm build:web`: build the web app; CI runs this after typecheck.
- `pnpm check`: run TypeScript checks and API tests together.

## Coding Style & Naming Conventions

Use strict TypeScript and the `@phywise/*` path aliases for shared packages instead of deep cross-package relative imports. TS/TSX files use two-space indentation, double quotes, PascalCase React components, and camelCase functions and variables. Keep app-only helpers in the relevant app `lib/` directory. Python targets 3.11, follows PEP 8 with four-space indentation, and uses snake_case modules and functions.

## Testing Guidelines

API tests use pytest and follow `test_*.py` naming under `apps/api/tests`. Add route tests for FastAPI behavior and service tests for domain transformations. For shared TypeScript package changes, run `pnpm typecheck` and update contract/domain examples when shapes change. Run `pnpm check` before opening a PR.

## Commit & Pull Request Guidelines

Recent commits use ticket-like prefixes followed by a short imperative summary, for example `FIX-BOARD stabilize whiteboard editing` or `BOARD-003 refactor workspace into board-first canvas editor`. Keep that format for new commits. PRs should describe product impact, list validation commands run, link related issues or docs, and include screenshots or short recordings for workspace UI changes.

## Security & Configuration Tips

Start local configuration from `.env.example`; never commit secrets. Default development uses SQLite at `storage/phywise.db`, local file storage under `storage/`, and inline parsing. Redis is only required when `PHYWISE_PARSE_EXECUTION_MODE=rq`.
