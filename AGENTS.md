Install deps: `bun install`.
Lint: `bun run lint` (oxlint).
Format: `bun run format` (prettier).
Tests: `bun test` (unit) or `bun run test:docker` (integration with D-Bus).
Single file: `bun test test/unmarshall-basic.test.ts`.
Filter by name: `bun test --test-name-pattern "pattern"`.
Test files: `test/*.test.ts` (TypeScript, ES imports, bun:test).
No semicolons; descriptive names (short loop indexes ok).
Error handling: fail fast, pass errors up with context.
Types: keep `index.d.ts` aligned with JS exports.
ESM: all new code must be ESM-only (no CommonJS).
Variables: use `const` by default, `let` only when reassignment is needed, never use `var`.
Naming: use descriptive variable names, no abbreviations (e.g., `message` not `msg`, `buffer` not `buf`).
Magic numbers: avoid magic numbers, use named constants instead (e.g., `const NEWLINE_BYTE = 0x0a`).
Commits: conventional commits, all lowercase, concise, no body, break changes into small commits.
Always run `bun run lint` and `bun test` after making changes to ensure nothing breaks.
