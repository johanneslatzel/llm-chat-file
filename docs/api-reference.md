# API Reference

## Common patterns

All tools return a `PartialToolResult` with shape:

```typescript
{
    status: ResultStatus.Success | ResultStatus.Error;
    result: string; // success message or error description
}
```

### Path parameters

All path parameters accept paths in two forms:

| Form | Example | Resolution |
|---|---|---|
| **Relative** | `"."`, `"src/index.ts"` | Resolved against the current workspace root. Use `"."` for the workspace root itself. |
| **Absolute** | `"/etc/config"`, `"/home/user/file"` | Used as-is (filesystem root — **not** workspace root). |

> ⚠️ Common mistake: `"/"` or `"/src"` refers to the **filesystem root**, not the workspace root. Use `"."` or `"./src"` for workspace-relative paths.

---

## Configuration

### `DirectoryConfiguration` default constructor

Construct a `DirectoryConfiguration` with no arguments to read all values from environment variables.

```typescript
import { DirectoryConfiguration } from '@johannes.latzel/llm-chat-file';
const config = new DirectoryConfiguration();
```

Alternatively, pass an options object to override specific values:

```typescript
const config = new DirectoryConfiguration([
    { type: AccessType.Read, path: '/var/log' },
    { type: AccessType.Write, path: '/home/project' },
]);
```

See [Environment Variables](env.md) for supported variables.

### `SearchConfiguration`

Controls search limits.

```typescript
import { SearchConfiguration } from '@johannes.latzel/llm-chat-file';
const config = new SearchConfiguration();  // defaults
const config = new SearchConfiguration(100);  // override maxSearchResults
```

| Parameter | Type | Description | Env var | Default |
|-----------|------|-------------|---------|---------|
| `maxSearchResults` | number | Max results returned | `LLM_CHAT_FS_MAX_SEARCH_RESULTS` | `50` |
| `maxDisplayEntries` | number | Threshold to switch from paths to count summary | `LLM_CHAT_FS_MAX_DISPLAY_ENTRIES` | `200` |
| `maxTotalEntries` | number | Hard limit: abort with error above this | `LLM_CHAT_FS_MAX_TOTAL_ENTRIES` | `5000` |
| `timeoutMs` | number | Total search timeout (partial results on timeout) | `LLM_CHAT_FS_SEARCH_TIMEOUT` | `10000` |

### `FileConfiguration`

Controls maximum characters per file read/write and maximum file size for read operations.

| Parameter | Type | Description | Env var | Default |
|-----------|------|-------------|---------|---------|
| `maxCharsPerFile` | number | Max characters per file read/write | `LLM_CHAT_FS_MAX_CHARS_PER_FILE` | `10000` |
| `maxFileSize` | number | Max file size in bytes for read ops | `LLM_CHAT_FS_MAX_FILE_SIZE` | `10485760` (10MB) |
| `requireReadBeforeWrite` | boolean | Require `read_file` before write/edit tools | `LLM_CHAT_FS_REQUIRE_READ_BEFORE_WRITE` | `true` |

```typescript
import { FileConfiguration } from '@johannes.latzel/llm-chat-file';
const config = new FileConfiguration();  // defaults
const config = new FileConfiguration(5000, 1024 * 1024);  // override
const config = new FileConfiguration(5000, 1024 * 1024, false);  // disable read-before-write
```

### `FilePool`

In-memory read-before-write tracker. Ensures write/edit tools have read the file before modifying it, detecting external modifications via mtime comparison.

```typescript
import { FilePool, FileConfiguration } from '@johannes.latzel/llm-chat-file';
const pool = new FilePool(new FileConfiguration(undefined, undefined, true));  // enabled
const pool = new FilePool(new FileConfiguration(undefined, undefined, false)); // disabled (no-op)
```

**How it works:**

1. `ReadFileTool` calls `FilePool.recordRead(resolvedPath)` — stores `Date.now()`
2. Write/edit tools call `FilePool.verifyWrite(resolvedPath)` — checks `st.mtime > lastRead`; returns error if file changed since last read
3. On success, write tools call `FilePool.recordWrite(resolvedPath)` — updates stored timestamp so the same tool can write again without an intervening read

`WriteFileTool` sets `allowNew: true`, so writing a brand-new file (ENOENT on stat) succeeds without a prior read. All other edit tools require an explicit prior `read_file`. Edit tool internal reads do NOT count as tracked reads — only explicit `read_file` calls satisfy the requirement.

### `Workspace`

Manages the current workspace path and access control.

```typescript
import { Workspace, AccessType } from '@johannes.latzel/llm-chat-file';

const ws = new Workspace({
    accesses: [
        { type: AccessType.Write, path: '/home/project' },
        { type: AccessType.Read, path: '/shared/data' },
    ],
});
```

---

## ReadFileTool (`read_file`)

Reads the full contents of one or more text files. Always pass an array of file paths via `paths` — use `["file.txt"]` for a single file or `["a.txt", "b.txt"]` for batch. Supports optional character limits and line ranges (`start_line`/`end_line`) for reading specific sections. For partial file edits, see `replace_file_lines`, `insert_file_content`, or `replace_file_content`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `paths` | string[] | yes | Array of file paths to read (absolute, or relative to workspace root) |
| `max_chars` | number | no | Maximum characters to return per file (default: config max) |
| `start_line` | number | no | First line to read (1-indexed, inclusive) |
| `end_line` | number | no | Last line to read (1-indexed, inclusive) |

**Returns:** Each path produces its own result (one entry per file). The LLM sees them as separate tool responses, each with its own status and content. Binary files are rejected.

```typescript
const ws = new Workspace({ accesses: [{ type: AccessType.Write, path: '/my/project' }] });
const tool = new ReadFileTool(ws);

// Single file
const [result] = await tool.execute({ paths: ['src/index.ts'] });
// result: "--- /my/project/src/index.ts (lines 1-42 of 42) ---\n...content..."

// Batch read — each file is a separate result
const results = await tool.execute({ paths: ['src/main.ts', 'src/utils.ts'] });
// results[0]: "--- /my/project/src/main.ts (lines 1-10 of 10) ---\n...content..."
// results[1]: "--- /my/project/src/utils.ts (lines 1-8 of 8) ---\n...content..."

// Batch with partial failure — each file has its own status
const results = await tool.execute({ paths: ['exists.txt', 'missing.txt'] });
// results[0].status: "success"
// results[0].result: "--- /my/project/exists.txt (lines 1-5 of 5) ---\n...content..."
// results[1].status: "error"
// results[1].result: "File not found: ENOENT: no such file or directory, stat '/my/project/missing.txt'"
```

---

## WriteFileTool (`write_file`)

Creates a new file or overwrites the entire content of an existing text file. For partial edits (line range or substring replacement) use `replace_file_lines`, `insert_file_content`, or `replace_file_content` instead. Creates parent directories automatically.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | File path (absolute, or relative to workspace root) |
| `content` | string | yes | Text content to write |

**Returns:** Confirmation message with the resolved path. Content is capped at `maxCharsPerFile`.

```typescript
const tool = new WriteFileTool(ws);
const result = await tool.execute({
    path: 'notes.txt',
    content: 'Hello, world!',
});
// "Written: /my/project/notes.txt"
```

---

## ReplaceFileLinesTool (`replace_file_lines`)

Replaces a range of lines in an existing text file with new content (partial edit, unlike `write_file` which overwrites the whole file). Uses `start_line`/`end_line` (1-indexed, inclusive) to specify the range. Empty content deletes the range. File must already exist.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | File path (absolute, or relative to workspace root) |
| `content` | string | yes | Text content to replace the lines with (empty string deletes the range) |
| `start_line` | number | yes | First line number to replace (1-indexed, inclusive) |
| `end_line` | number | no | Last line number to replace (1-indexed, inclusive). Defaults to `start_line` |

```typescript
const tool = new ReplaceFileLinesTool(ws);
const result = await tool.execute({
    path: 'src/main.ts',
    content: 'const x = 42;',
    start_line: 10,
    end_line: 12,
});
// "Replaced lines 10-12 in /my/project/src/main.ts"
```

---

## InsertFileContentTool (`insert_file_content`)

Inserts new text content at a specific line in an existing text file without overwriting existing content. Use `line` (1-indexed) to insert before a given line. Omit `line` to append at end of file. File must already exist.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | File path (absolute, or relative to workspace root) |
| `content` | string | yes | Text content to insert |
| `line` | number | no | Insert before this line number (1-indexed). Omit to append at end of file. |

```typescript
const tool = new InsertFileContentTool(ws);
const result = await tool.execute({
    path: 'src/main.ts',
    content: 'import { foo } from "./bar";',
    line: 1,
});
// "Inserted content at line 1 in /my/project/src/main.ts"
```

---

## ReplaceFileContentTool (`replace_file_content`)

Replaces an exact substring in an existing text file with new content (partial edit, unlike `write_file` which overwrites the whole file). Uses `replace_all` to replace all occurrences vs only the first. Works like find-and-replace. File must already exist.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | File path (absolute, or relative to workspace root) |
| `old_content` | string | yes | Exact substring to find (literal match, not a regex) |
| `new_content` | string | yes | Replacement text (empty string deletes the match) |
| `replace_all` | boolean | no | Replace all occurrences vs first only. Default `false`. |

```typescript
const tool = new ReplaceFileContentTool(ws);
// Replace first occurrence
const result = await tool.execute({
    path: 'src/main.ts',
    old_content: 'foo',
    new_content: 'bar',
});
// "Replaced content in /my/project/src/main.ts"

// Replace all occurrences
const result = await tool.execute({
    path: 'src/main.ts',
    old_content: 'foo',
    new_content: 'bar',
    replace_all: true,
});
// "Replaced content in /my/project/src/main.ts"
```

---

## SearchEntriesTool (`search_entries`)

Searches for files and directories by name, content pattern, and/or creation/modification timestamps. If no filter is provided, all entries are returned (up to `max_results`).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | no | Directory path (absolute, or relative to workspace root) |
| `type` | string | no | Entry type filter: `"file"`, `"directory"`, or `"both"` (default) |
| `name_pattern` | string | no | JavaScript regex to match file/directory names (case-insensitive) |
| `content_pattern` | string | no | JavaScript regex to search file contents (case-insensitive, files only) |
| `max_results` | number | no | Maximum results (default: config max) |
| `max_size` | number | no | Maximum file size in bytes for content searches (capped by config) |
| `created_after` | string | no | ISO 8601 datetime — files created after this time |
| `created_before` | string | no | ISO 8601 datetime — files created before this time |
| `modified_after` | string | no | ISO 8601 datetime — files modified after this time |
| `modified_before` | string | no | ISO 8601 datetime — files modified before this time |

**Returns:** One entry per line. File content matches show `path:line: content`; name-only matches show `path`; directory matches show `path/`. When timestamp filters are active, each result appends `(created: ..., modified: ...)`. Binary files and skipped directories are silently excluded. Search has a configurable timeout; partial results are returned if exceeded.

```typescript
const tool = new SearchEntriesTool(ws);

// Search by name and content (AND logic)
const result = await tool.execute({ name_pattern: '\\.ts$', content_pattern: 'TODO' });
// "src/main.ts:10:   // TODO: implement this\nsrc/utils.ts:42:   // TODO: add error handling"

// Search by name only
const result = await tool.execute({ name_pattern: '\\.ts$' });
// "src/main.ts\nsrc/utils.ts"

// Search by content only
const result = await tool.execute({ content_pattern: 'FIXME' });
// "src/main.ts:10:   // FIXME: this is broken"

// Filter by modification time
const result = await tool.execute({ modified_after: '2025-01-01T00:00:00.000Z' });
// "src/main.ts  (created: 2025-01-15T10:00:00.000Z, modified: 2025-03-20T14:30:00.000Z)"

// List everything in the workspace
const result = await tool.execute({});
// "readme.txt\ndocs/\nsrc/\nsrc/main.ts\n..."
```

---

## ListDirectoryTool (`list_directory`)

Lists files and directories in a path. Directories are suffixed with `/`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Directory path (absolute, or relative to workspace root) |
| `recursive` | boolean | no | Set to `true` for recursive depth-first listing |

**Returns:** One entry per line; directories end with `/`.

```typescript
const tool = new ListDirectoryTool(ws);
const result = await tool.execute({ path: '.' });
// "file1.txt\nfile2.txt\nsubdir/"
```

---

## CreateFolderTool (`create_folder`)

Creates a directory and any necessary parent directories.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Directory path (absolute, or relative to workspace root) |

**Returns:** Confirmation message with the created directory path.

```typescript
const tool = new CreateFolderTool(ws);
const result = await tool.execute({ path: 'src/components' });
// "Created directory: /my/project/src/components/"
```

---

## DeleteFileTool (`delete_file`)

Deletes a file or directory. Use `recursive=true` to delete non-empty directories and all their contents.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Path (absolute, or relative to workspace root) |
| `recursive` | boolean | no | Set to `true` to delete directories and their contents recursively |

**Returns:** Confirmation message with the deleted path and type.

```typescript
const tool = new DeleteFileTool(ws);
const result = await tool.execute({ path: 'old-file.txt' });
// "Deleted file: /my/project/old-file.txt"

const result = await tool.execute({ path: 'old-dir', recursive: true });
// "Deleted directory: /my/project/old-dir"
```

---

## MoveFileTool (`move_file`)

Moves or renames a file or directory.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source` | string | yes | Source path (absolute, or relative to workspace root) |
| `destination` | string | yes | Destination path (absolute, or relative to workspace root) |

**Returns:** Confirmation message with the source and destination paths.

```typescript
const tool = new MoveFileTool(ws);
const result = await tool.execute({
    source: 'old-name.txt',
    destination: 'new-name.txt',
});
// "Moved: /my/project/old-name.txt -> /my/project/new-name.txt"
```

---

## FileAccessInfoTool (`file_access_info`)

Returns a list of all configured directories with their access levels (read/write) and indicates which one is the current workspace path. Useful for discovering which parts of the filesystem are available.

No parameters required.

**Returns:** One line per directory with its access type; the current workspace is marked with `(current workspace)`.

```typescript
const tool = new FileAccessInfoTool(ws);
const result = await tool.execute({});
// "Configured file system access:
//   /home/user/project                                       write  (current workspace)
//   /var/log                                                  read"
```

---

## EntryInfoTool (`entry_info`)

Returns metadata about a filesystem entry (file, directory, symlink, etc.) — type, size, timestamps, permissions, and symlink target if applicable.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Path (absolute, or relative to workspace root) |

**Returns:** One line per metadata field.

```typescript
const tool = new EntryInfoTool(ws);
const result = await tool.execute({ path: 'src/index.ts' });
// "Path: /home/user/project/src/index.ts
//  Type: file
//  Size: 1240 bytes
//  Permissions: rw-r--r--
//  Created: 2025-01-15T10:00:00.000Z
//  Modified (content): 2025-03-20T14:30:00.000Z
//  Accessed: 2025-03-21T09:00:00.000Z
//  Changed (metadata): 2025-03-20T14:30:00.000Z"
```

---

## SwitchWorkspaceTool (`switch_workspace`)

Changes the current workspace path to a new directory within configured accessible directories. Must be called before any other filesystem tool when changing workspace. Do NOT call this tool in parallel with any other filesystem tool.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Target directory path |

**Returns:** Confirmation message with the new workspace path.

```typescript
const tool = new SwitchWorkspaceTool(ws);
const result = await tool.execute({ path: '/another/project' });
// "Switched workspace to: /another/project"
```

---

## FileToolPackage

Bundles all 13 file tools into a single package for easy registration with `ToolSuite.add()`. Provides a tutorial with path-resolution guidance.

```typescript
import { FileToolPackage, Workspace, DirectoryConfiguration } from '@johannes.latzel/llm-chat-file';
import { ToolSuite } from '@johannes.latzel/llm-chat';

const ws = new Workspace(new DirectoryConfiguration());
const pkg = new FileToolPackage(ws);
const suite = new ToolSuite();
suite.add(pkg);
```

| Constructor param | Type | Required | Description |
|-------------------|------|----------|-------------|
| `workspace` | `Workspace` | yes | Workspace instance for access control |
| `searchConfig?` | `SearchConfiguration` | no | Search limits (timeout, max results) |
| `fileConfig?` | `FileConfiguration` | no | File read/write limits (max chars, max size) |
| `filePool?` | `FilePool` | no | Read-before-write tracker. Created internally from `requireReadBeforeWrite` if omitted. |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `tools()` | `Tool[]` | All 13 file tools |
| `tutorial()` | `string \| null` | Path-resolution guidance, common mistakes, and exploration tips |
| `composeTutorial()` | `string` | Formatted output with package name, tool list, and tutorial |

The bundled tools are: `search_entries`, `list_directory`, `read_file`, `write_file`, `replace_file_lines`, `insert_file_content`, `replace_file_content`, `entry_info`, `delete_file`, `create_folder`, `move_file`, `file_access_info`, `switch_workspace`.

---

## License

MIT — see [`LICENSE`](https://github.com/johanneslatzel/llm-chat-file/blob/main/LICENSE).
