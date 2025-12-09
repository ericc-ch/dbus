# AGENTS

Scope: repo root.
No Cursor/Copilot rules found.
Node >=8; use bun.
Install deps: `bun install`.
Lint all: `bun run lint`.
Lint code: `bun run lint:code`.
Lint examples/docs: `bun run lint:docs`.
Format JS: `bun run prettier` (semi true, singleQuote, no trailing comma).
Tests full: `bun run test` (lint + mocha).
Tests only: `bun run test:raw`.
Single file: `bun run mocha test/unmarshall-basic.js`.
Filter by name: `bun run test:raw -- --grep "pattern"`.
ESLint: recommended + prettier; eqeqeq always; console/empty ok; loop const-cond allowed.
Environment: CommonJS modules; Node + Mocha globals; ES6.
Prefer `require`/`module.exports`; keep async callbacks `(err, value)`.
Use semicolons/single quotes; avoid trailing commas; descriptive names (short loop indexes ok).
Error handling: fail fast, pass errors up with context.
Types: keep `index.d.ts` aligned with JS exports.
Pre-commit: lint-staged runs prettier on staged `.js`.
