# Overview

Filesystem tools for the `@johannes.latzel/llm-chat` ecosystem. This package gives LLM-powered agents safe, scoped access to read and write files, list directories, search by name or content, and manage workspaces, all within a configurable access-control boundary.

## Navigation

- [Quick Start](quickstart.md): install and run the first tool
- [Architecture](architecture.md): how the `Workspace` gatekeeper works
- [Environment Variables](env.md): configuration reference
- [API Reference](api-reference.md): full tool documentation with parameter tables

## Common patterns

### Path parameters

All path parameters accept relative or absolute filesystem paths. Relative paths are resolved against the current workspace root. Absolute paths are used as-is.

### Access control

Each tool enforces either read or write access on resolved paths via the `Workspace` class, shared from [`@johannes.latzel/llm-chat-workspace`](https://github.com/johanneslatzel/llm-chat-workspace). See [Architecture](architecture.md) for details.

## License

MIT. See [`LICENSE`](https://github.com/johanneslatzel/llm-chat-file/blob/main/LICENSE).
