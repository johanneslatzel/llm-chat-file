# Environment Variables

All variables are optional. Constructor parameters take precedence over environment variables.

Workspace access control (`Workspace` / `DirectoryConfiguration`) is provided by
[`@johannes.latzel/llm-chat-workspace`](https://github.com/johanneslatzel/llm-chat-workspace),
see its [documentation](https://johanneslatzel.github.io/llm-chat-workspace/) for the native
`LLM_CHAT_WORKSPACE_*` variables.

## Search limits

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LLM_CHAT_FS_SEARCH_TIMEOUT` | number | `10000` | Total search timeout in milliseconds; partial results returned on timeout |
| `LLM_CHAT_FS_MAX_SEARCH_RESULTS` | number | `50` | Maximum results returned per search |
| `LLM_CHAT_FS_MAX_DISPLAY_ENTRIES` | number | `200` | Threshold above which matches are replaced by a count summary |
| `LLM_CHAT_FS_MAX_TOTAL_ENTRIES` | number | `5000` | Hard limit on entries to traverse; returns an error if exceeded |

## File limits

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LLM_CHAT_FS_MAX_CHARS_PER_FILE` | number | `100000` | Maximum characters read from or written to a file |
| `LLM_CHAT_FS_MAX_FILE_SIZE` | number | `10485760` (10 MB) | Maximum raw file size in bytes for read operations |
| `LLM_CHAT_FS_REQUIRE_READ_BEFORE_WRITE` | boolean | `true` | Require `read_file` before write/edit tools. Set to `"false"` to disable. |
