# Overview

Filesystem tools for the `llm-chat` ecosystem. This package gives LLM-powered agents safe, scoped access to read and write files, list directories, search by name or content, and manage workspaces — all within a configurable access-control boundary.

- [Quick Start](quickstart.md) — get up and running in 5 minutes
- [Architecture](architecture.md) — how the `Workspace` gatekeeper works
- [Environment Variables](env.md) — configuration reference
- [API Reference](api-reference.md) — full tool documentation with parameter tables

## Common patterns

### Path parameters

All path parameters accept relative or absolute filesystem paths. Relative paths are resolved against the current workspace root. Absolute paths are used as-is.

### Access control

Each tool enforces either read or write access on resolved paths via the `Workspace` class. See [Architecture](architecture.md) for details.
