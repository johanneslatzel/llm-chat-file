# Environment Variables

All variables are optional. Constructor parameters take precedence over environment variables.

## Access control

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_CHAT_FS_READ_DIRS` | — | Comma-separated directories with read-only access |
| `LLM_CHAT_FS_WRITE_DIRS` | — | Comma-separated directories with read-write access |
| `LLM_CHAT_FS_WORKSPACE` | `process.cwd()` | Default workspace directory (auto-added as writable) |
| `LLM_CHAT_FS_SKIP_DIRS` | — | Comma-separated directory names to skip when walking trees (e.g. `node_modules`, `.git`) |
| `LLM_CHAT_FS_RESOLVE_SYMLINKS` | `false` | Set to `"true"` to resolve symlinks before access checks |

## Search limits

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_CHAT_FS_SEARCH_TIMEOUT` | `10000` | Total search timeout in milliseconds; partial results returned on timeout |
| `LLM_CHAT_FS_MAX_SEARCH_RESULTS` | `50` | Maximum results returned per search |
| `LLM_CHAT_FS_MAX_DISPLAY_ENTRIES` | `200` | Threshold above which results show a count summary instead of individual paths |
| `LLM_CHAT_FS_MAX_TOTAL_ENTRIES` | `5000` | Hard limit on entries to traverse; returns an error if exceeded |

## File limits

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_CHAT_FS_MAX_CHARS_PER_FILE` | `10000` | Maximum characters read from or written to a file |
| `LLM_CHAT_FS_MAX_FILE_SIZE` | `10485760` (10 MB) | Maximum raw file size in bytes for read operations |
| `LLM_CHAT_FS_REQUIRE_READ_BEFORE_WRITE` | `true` | Require `read_file` before write/edit tools. Set to `"false"` to disable. |
