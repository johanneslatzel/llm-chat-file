# Architecture

## Overview

`llm-chat-file` extends the `llm-chat` framework with filesystem tools — file read/write, directory listing, entry search (by name, content, and timestamps), and workspace switching — all scoped to a configured workspace with access control.

## Design

### Workspace

The `Workspace` class is the central gatekeeper for all filesystem operations. It is constructed with a `DirectoryConfiguration` that defines which directories are readable and which are writable.

```typescript
const ws = new Workspace({
    accesses: [
        { type: AccessType.Read, path: '/var/log' },
        { type: AccessType.Write, path: '/home/project' },
    ],
});
```

**Key methods:**

- `normalize(input)` — resolves relative paths against `currentPath`; absolute paths are returned as-is by `path.resolve`
- `canRead(absPath)` — checks if a resolved path falls within any read or write access directory
- `canWrite(absPath)` — checks if a resolved path falls within a write access directory
- `getAccesses()` — returns all configured directory accesses with their types and resolved paths
- `walk(dir)` — async generator that recursively walks directories, skipping common non-text directories (`.git`, `node_modules`, etc.) and silently dropping subdirectories that cannot be read due to permission errors

### Path security

All tools follow the same access control pattern:

1. The raw user-provided path is normalized via `ws.normalize(path)`
2. The tool calls `ws.canRead()` or `ws.canWrite()` on the resolved path
3. Path traversal attempts (e.g. `../../etc/passwd`) are blocked because `path.resolve()` resolves `..` segments before the access check

By default, symlinks are followed as-is: if a configured directory contains a symlink pointing outside, the symlink target is accessible. Set `LLM_CHAT_FS_RESOLVE_SYMLINKS=true` (or pass `resolveSymlinks: true` to `DirectoryConfiguration`) to resolve symlinks via `fs.realpathSync.native()` before access checks. This prevents symlink-based path traversal but may break legitimate symlinks.

**Access rules:**

| Operation | Check |
|-----------|-------|
| `read_file` | `canRead` |
| `write_file` | `canWrite` |
| `search_entries` | `canRead` |
| `list_directory` | `canRead` |
| `create_folder` | `canWrite` |
| `delete_file` | `canWrite` |
| `move_file` | `canWrite` (both src and dest) |
| `file_access_info` | none |
| `entry_info` | `canRead` |

### Tool classes

Each tool extends `Tool` from `llm-chat`:

1. Constructor accepts a `Workspace` instance (and optional configuration, e.g., `SearchConfiguration` with `timeoutMs`) and calls `super(name, description, params)`
2. `onExecute()` validates parameters, normalizes paths, checks access, performs the operation, and returns `PartialToolResult`
3. All errors are caught and returned as plain-string messages — tools never throw

### Async directory walk

The `Workspace.walk()` method is an async generator that recursively walks a directory tree. It:

- Returns `{ filePath, dirent }` entries for both files and directories
- Skips directories whose names are listed in `DirectoryConfiguration.skipDirs`
- Silently drops subdirectories that cannot be read (permission errors) — partial results are better than failing the entire operation
- Is used by `SearchEntriesTool` and by `list_directory` in recursive mode

### Concurrency

`switchWorkspace()` uses `async-mutex` to prevent concurrent switches from interleaving. However, this mutex does **not** serialize against regular filesystem tool calls. See [`problems.md`](https://github.com/johanneslatzel/llm-chat-file/blob/main/problems.md) for details.

## Dependencies

- `@johannes.latzel/llm-chat` — framework providing `Tool`, `ToolParameters`, `ToolParameterProperty`, etc.
- `async-mutex` — concurrency protection for workspace switching
- `isbinaryfile` — binary file detection
