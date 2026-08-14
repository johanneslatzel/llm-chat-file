# Architecture

## Overview

`llm-chat-file` extends the `llm-chat` framework with filesystem tools: file read/write, directory listing, entry search (by name, content, and timestamps), and workspace switching, all scoped to a configured workspace with access control.

## Design

### Workspace

The `Workspace` class is the central gatekeeper for all filesystem operations. It is constructed with a `DirectoryConfiguration` that defines which directories are readable and which are writable. Both classes (plus `SwitchWorkspaceTool`) come from [`@johannes.latzel/llm-chat-workspace`](https://github.com/johanneslatzel/llm-chat-workspace), see its [documentation](https://johanneslatzel.github.io/llm-chat-workspace/) for the full API (`normalize`, `canRead`, `canWrite`, `getAccesses`, `walk`, `switchWorkspace`).

```typescript
const ws = new Workspace(new DirectoryConfiguration([
    { type: AccessType.Read, path: '/var/log' },
    { type: AccessType.Write, path: '/home/project' },
]));
```

### Path security

All tools follow the same access control pattern:

1. The raw user-provided path is normalized via `ws.normalize(path)`
2. The tool calls `ws.canRead()` or `ws.canWrite()` on the resolved path
3. Path traversal attempts (e.g. `../../etc/passwd`) are blocked because `path.resolve()` resolves `..` segments before the access check

Symlink handling is controlled by the workspace package's `resolveSymlinks` option. See its [documentation](https://johanneslatzel.github.io/llm-chat-workspace/) for details.

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
3. All errors are caught and returned as plain-string messages, tools never throw

### Async directory walk

Directory walking (`Workspace.walk()`) is provided by the workspace package. It skips directories
listed in `skipDirs` and silently drops subdirectories that cannot be read (permission errors),
partial results are better than failing the entire operation. It is used by `SearchEntriesTool` and
by `list_directory` in recursive mode.

### Concurrency

Workspace switching and read-before-write tracking are protected by an `async-mutex`. The switch
mutex does **not** serialize against regular filesystem tool calls. See
[`problems.md`](https://github.com/johanneslatzel/llm-chat-file/blob/main/problems.md) for details.

### Read-before-write safety

The `FilePool` class enforces read-before-write safety: write/edit tools reject the operation if the file has never been read, or if it changed via mtime since the last tracked read.

1. `FilePool` uses `async-mutex` (`Mutex`) for thread safety, following the same pattern as `switchWorkspace`
2. `recordRead(resolved)` stores `Date.now()` as the read timestamp
3. `verifyWrite(resolved)` calls `fsp.stat(resolved)` and compares `st.mtime.getTime() > lastRead`, the filesystem mtime is the authoritative source for detecting external modifications
4. `recordWrite(resolved)` stores `Date.now()` (uses clock time rather than `fstat`, the tool just wrote the file, so avoiding the syscall is fine)
5. Edit tool internal reads (reading the file to apply a partial edit) do NOT count as a tracked read, only an explicit `read_file` tool call satisfies the requirement
6. `WriteFileTool` calls `verifyWrite(resolved, true)`, `allowNew` skips the check for ENOENT so creating brand-new files works without a prior read
7. The feature is enabled by default; set `LLM_CHAT_FS_REQUIRE_READ_BEFORE_WRITE=false` or pass `requireReadBeforeWrite: false` to `FileConfiguration` to disable

## Dependencies

- `@johannes.latzel/llm-chat`: framework providing `Tool`, `ToolParameters`, `ToolParameterProperty`, etc.
- `@johannes.latzel/llm-chat-workspace`: workspace and access control (`Workspace`, `DirectoryConfiguration`, `SwitchWorkspaceTool`)
- `async-mutex`: concurrency protection for workspace switching
- `isbinaryfile`: binary file detection
