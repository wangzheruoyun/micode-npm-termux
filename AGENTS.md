# AGENTS.md - micode OpenCode Plugin

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run check` | Full quality gate: biome + eslint + typecheck + tests |
| `npm run build` | Build to `dist/` for publishing |
| `npm test` | Run all tests |
| `npm test <pattern>` | Run single test file (e.g., `npm test tests/utils/config.test.ts`) |
| `npm run lint` | Lint only (biome + eslint) |
| `npm run typecheck` | TypeScript type-check only |

**Required order for quality gate:** `biome check . && eslint . && npm run typecheck && npm test`

## Architecture Overview

**OpenCode plugin** implementing Brainstorm → Plan → Implement workflow with session continuity.

### Key Directories
- `src/agents/` - Agent configs (pure data, exports `AgentConfig`)
- `src/hooks/` - Lifecycle hook factories (`createXHook(ctx: PluginInput) => { handlers }`)
- `src/tools/` - Tool definitions via `@opencode-ai/plugin/tool`
- `src/utils/` - Shared: `config.ts`, `errors.ts`, `logger.ts`, `model-limits.ts`
- `src/mindmodel/` - Project-specific pattern constraints loader/classifier/reviewer
- `src/octto/` - Browser brainstorming UI (WebSocket, state, HTML bundle)
- `src/indexing/` - Milestone artifact classification/ingestion for `/search`
- `src/config-loader.ts` - Loads/validates `micode.json`, merges agent overrides
- `src/index.ts` - Plugin entry point, exports `OpenCodeConfigPlugin`

### Plugin Commands
| Command | Agent | Purpose |
|---------|-------|---------|
| `/init` | project-initializer | Generate ARCHITECTURE.md + CODE_STYLE.md |
| `/mindmodel` | mm-orchestrator | Generate `.mindmodel/` constraints |
| `/ledger` | ledger-creator | Create/update continuity ledger |
| `/search` | artifact-searcher | Search past plans/ledgers |

### Key Agents
| Agent | Role |
|-------|------|
| commander | Orchestrator |
| brainstormer | Design exploration + research subagents |
| planner | Implementation plans (TDD tasks, file paths) |
| executor | Orchestrates implementer→reviewer cycles in git worktree |
| implementer | Execute tasks (TDD) |
| reviewer | Verify correctness |

## Development Conventions

### Code Style (Enforced)
- **No classes** for business logic — use factory functions `createX` with closed-over state
- **Max 2 nesting levels** in function bodies — early returns, small helpers
- **Max 40 lines** per function (skipping blanks/comments)
- **No `any` types** — use Valibot schemas or type guards at boundaries
- **No magic numbers/strings** — named constants in `src/utils/config.ts`
- **No default exports** in `src/` — named exports only, re-export via barrel `index.ts`
- **No parent-relative imports** (`../`) — use `@/*` aliases for cross-folder imports
- **Valibot** for runtime validation at boundaries (`v.pipe`, `v.InferOutput`)
- **Errors as values** — use `extractErrorMessage` from `src/utils/errors.ts` in catch blocks

### TypeScript Conventions
- **Domain-meaningful names** — no `data`, `result`, `temp`; drop redundant prefixes (`allWarnings` → `warnings`)
- **No type names in identifiers** — no `Map`, `Array`, `List`, `String` suffixes
- **`interface` for contracts**, `type` for unions/aliases
- **Discriminated unions** over class hierarchies
- **`as const` maps** for statuses/events → derive union types
- **`import type`** for type-only imports
- **Explicit return types** on exported functions
- **`readonly`** on immutable data structures

### Module Structure (enforced order)
1. Imports
2. Exported types/constants
3. Internal constants/schemas
4. Private helpers
5. Main factory/export

### Testing (Vitest)
- **Test real behavior** — mock data, not behavior
- **All error paths tested** — all public exports tested
- **Tests in `tests/`** mirroring `src/` structure
- **Use `/tmp` unique paths** for filesystem tests, cleanup in `afterEach`
- **Poll for conditions** over fixed sleeps (`waitUntil` pattern)

### Quality Gate (CI runs this on every PR)
```bash
npm run check  # biome check . && eslint . && npm run typecheck && npm test
```

Pre-commit (lefthook): `biome check + eslint --fix` on staged files (skipped on unsupported platforms).

## Build & Release

```bash
npm run build          # tsc --project tsconfig.build.json
npm version patch      # or minor, major
git push --follow-tags # triggers release.yml
```

## Key Dependencies
- `@opencode-ai/plugin:1.14.19` - Plugin SDK
- `valibot:^1.2.0` - Schema validation
- `zigpty:^0.1.0` - Cross-platform PTY in Zig (Android/Termux support, graceful fallback)
- `jsonc-parser:^3.3.1` - JSONC config parsing
- `fts5-sql-bundle:^1.0.0` - SQL.js with FTS5 full-text search (replaces sql.js)
- `ws:^8.18.0` - WebSocket server for octto browser UI
- `yaml:^2.8.2` - YAML parsing for mindmodel

## Common Tasks

### Add a new agent
1. Create `src/agents/my-agent.ts` exporting `AgentConfig`
2. Re-export in `src/agents/index.ts`
3. Register in `src/index.ts` plugin config

### Add a new hook
1. Create `src/hooks/my-hook.ts` exporting `createMyHook(ctx: PluginInput) => { handlers }`
2. Re-export in `src/hooks/index.ts`
3. Instantiate and register in `src/index.ts`

### Add a new tool
1. Create `src/tools/my-tool.ts` using `tool()` from `@opencode-ai/plugin`
2. Re-export in `src/tools/index.ts` (if barrel exists) or import directly

### Add Valibot schema
1. Define schema in `src/.../types.ts` using `v.*`
2. Export `infer` type: `export type MyType = v.InferOutput<typeof MySchema>`
3. Use `v.parse` or `v.safeParse` at boundaries

### Run single test
```bash
npm test tests/utils/config.test.ts
```

## CI / Release
- `.github/workflows/quality-gate.yml` runs `npm run check` + `npm run build` on PR/main
- Release: `npm version patch && git push --follow-tags` (publishes to npm via release.yml)

## Config Files to Know
- `package.json` - scripts, dependencies, build config
- `biome.json` - formatting/linting rules
- `eslint.config.js` - additional ESLint rules (sonarjs, unicorn)
- `tsconfig.json` - strict TS config
- `tsconfig.build.json` - build-specific TS config (outputs to dist/)
- `vitest.config.ts` - Vitest test configuration
- `lefthook.yml` - pre-commit hooks
- `.mindmodel/manifest.yaml` - mindmodel constraint definitions

## Architecture Notes
- **Entry point**: `src/index.ts` exports `OpenCodeConfigPlugin`
- **Plugin context** (`PluginInput`) injected into all hook factories via `ctx`
- **Internal sessions** (reviewer, etc.) tracked in `internalSessions` Set for filtering
- **MCP servers**: context7 (always), perplexity/firecrawl (env-gated)
- **Think mode**: Keywords like "think hard" enable 128k token thinking budget
- **Auto-compact**: Triggers at 50% context usage (`compactionThreshold: 0.5`)
- **Artifacts**: Stored in `thoughts/` — `ledgers/`, `shared/plans/`, `shared/designs/`

## Migration Notes (Bun → npm)

### Bun → npm migration (2026-07-28)
Migrated from Bun to Node.js + npm for broader platform compatibility (including Android/Termux).

**Key changes:**
- **Package manager**: `bun install` → `npm install`
- **Test runner**: `bun test` → `vitest` (compatible with `bun:test` APIs)
- **Build**: `bun build` → `tsc --project tsconfig.build.json`
- **Database**: `better-sqlite3` → `fts5-sql-bundle` (WASM SQLite with FTS5) for cross-platform support
- **WebSocket**: `Bun.serve` → `ws` library with Node.js HTTP server
- **File I/O**: `Bun.write`, `Bun.file` → `node:fs/promises`
- **Process spawn**: `Bun.spawn` → `node:child_process.spawn`
- **Timer/Event APIs**: `Bun.*` globals → Node.js equivalents

**Skipped/Blocked features (documented for future):**
- **bun-pty**: Native PTY requires Bun's `bun:ffi` - not available on Node.js. **Replaced with zigpty** (2026-07-28) — cross-platform PTY in Zig with native Android/Termux support and graceful fallback to pure-TypeScript pipe-based PTY when native bindings unavailable. See [zigpty](https://github.com/pithings/zigpty).
- **FTS5 full-text search**: Not available in sql.js WASM build (requires custom SQLite compilation). **Replaced with fts5-sql-bundle** (2026-07-28) — drop-in SQL.js replacement with FTS5 enabled via custom Emscripten build. See [fts5-sql-bundle](https://www.npmjs.com/package/fts5-sql-bundle).
- **lefthook pre-commit**: Binary not available on Android/Termux - prepare script skipped.

**ESLint config updates:**
- Removed `lefthook` from devDependencies (unsupported platform)
- Added `@types/node`, `@types/sql.js`, `@types/ws`
- Added `vitest` as test runner with globals

### Common Pitfalls
- **Node.js 20+ required** — for modern ESM support and `node:` protocol imports
- **No `bun-pty` in dist** — marked `external` in build, installed at runtime by user
- **Type-only imports** — must use `import type` or Biome will error
- **Circular imports** — avoid `../` imports; use `@/` aliases
- **Valibot schemas** — use `v.pipe` for chains; treat parse failures as warnings where possible