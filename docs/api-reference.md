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

All path parameters accept relative or absolute filesystem paths. Relative paths are resolved against the current workspace root. Absolute paths are used as-is.

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

```typescript
import { FileConfiguration } from '@johannes.latzel/llm-chat-file';
const config = new FileConfiguration();  // defaults
const config = new FileConfiguration(5000, 1024 * 1024);  // override
```

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

Reads the contents of a text file. Supports optional character limits and line ranges.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | File path (absolute or relative to workspace) |
| `max_chars` | number | no | Maximum characters to return (default: config max) |
| `start_line` | number | no | First line to read (1-indexed, inclusive) |
| `end_line` | number | no | Last line to read (1-indexed, inclusive) |

**Returns:** File content with a header showing the resolved path and line range. Binary files are rejected.

```typescript
const ws = new Workspace({ accesses: [{ type: AccessType.Write, path: '/my/project' }] });
const tool = new ReadFileTool(ws);
const result = await tool.execute({ path: 'src/index.ts' });
// "--- /my/project/src/index.ts (lines 1-42 of 42) ---\n...content..."
```

---

## WriteFileTool (`write_file`)

Writes text content to a file. Creates parent directories automatically.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | File path (must be within writable directory) |
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

## SearchEntriesTool (`search_entries`)

Searches for files and directories by name, content pattern, and/or creation/modification timestamps. If no filter is provided, all entries are returned (up to `max_results`).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | no | Directory to search in (default: workspace root) |
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
| `path` | string | yes | Directory path (absolute or relative to workspace) |
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
| `path` | string | yes | Directory path (must be within writable directory) |

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
| `path` | string | yes | File or directory path (must be within writable directory) |
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
| `source` | string | yes | Source path (must be within writable directory) |
| `destination` | string | yes | Destination path (must be within writable directory) |

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
| `path` | string | yes | File system path (absolute or relative to workspace) |

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

## License

MIT — see [`LICENSE`](https://github.com/johanneslatzel/llm-chat-file/blob/main/LICENSE).
