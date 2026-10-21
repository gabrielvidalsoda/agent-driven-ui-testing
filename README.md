# Agent-Driven UI Testing

> Public, sanitized extract of client work. Client identifiers, credentials, environments and evidence have been removed; the harness itself is otherwise unmodified.

A Claude Code CLI + Playwright MCP agent harness for UI testing driven by YAML specs. It uses a two-role flow (Mapper reads screens read-only, Tester produces per-CT verdicts) with Oracle seeding discipline, evidence redaction, and a hermetic test layer (Vitest) that runs with no API cost.

## Highlights

- **Two agent roles** — Mapper inventories screens; Tester evaluates each test case with findings beyond the script.
- **YAML-driven** — run definitions (config/corrida*.yaml, config/alvos.yaml, config/sessoes.yaml) control what gets executed.
- **Hermetic tests** — 
pm test runs 422 Vitest tests with zero API calls.
- **Evidence redaction** — built-in redaction module for sanitizing captured evidence.
- **Oracle seeding discipline** — controlled setup/teardown for repeatable runs.
- **HTML reporting** — consolidated reports from agent runs.

## Quick start

`ash
npm ci
npm test        # run hermetic unit tests
`

Agent runs require Claude Code CLI and Playwright MCP configured locally.

## Scripts

| Script | Purpose |
| --- | --- |
| 
pm test | Run hermetic Vitest tests |
| 
pm run dev | Run the CLI |

## Docs

- [docs/DESIGN.md](docs/DESIGN.md) — design rationale and architecture.
- [mapas/](mapas/) — screen maps used by the agents.

## License

[MIT](LICENSE) © Gabriel Vidal