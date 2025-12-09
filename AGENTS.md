# AGENTS

Install deps: `bun install`.
Lint: `bun run lint` (oxlint).
Format: `bun run format` (prettier).
Tests: `bun test`.
Single file: `bun test test/unmarshall-basic.test.ts`.
Filter by name: `bun test --test-name-pattern "pattern"`.
Test files: `test/*.test.ts` (TypeScript, ES imports, bun:test).
Lib files: CommonJS modules (`require`/`module.exports`).
Prefer async callbacks `(err, value)` in lib code.
No semicolons; descriptive names (short loop indexes ok).
Error handling: fail fast, pass errors up with context.
Types: keep `index.d.ts` aligned with JS exports.
Pre-commit: lint-staged runs prettier on staged `.js`.
Commits: conventional commits, all lowercase, concise, no body, break changes into small commits.
