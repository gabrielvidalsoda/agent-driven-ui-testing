# Agent-Driven UI Testing — Design Document

> Public, sanitized extract of client work. Client identifiers, credentials, environments and evidence have been removed; the harness itself is otherwise unmodified.

## Overview

This suite uses Claude Code CLI + Playwright MCP with two roles:

- **Mapper** — read-only screen inventory and map generation.
- **Tester** — executes per-CT cases, emits verdicts and findings beyond the script.

## Architecture

- src/ — core logic (agents, redaction, reporting, Oracle helpers)
- config/ — run definitions (YAML)
- mapas/ — screen maps
- 	ests/ — hermetic Vitest suite (422 tests)
- scripts/ — utilities
- perfis/ — profile examples

## Principles

- **Deterministic runs** — seeding discipline and controlled inputs
- **Redaction first** — evidence sanitised before reporting
- **Read-only mapping** — safe discovery without mutations
- **Separation of concerns** — mapping vs testing