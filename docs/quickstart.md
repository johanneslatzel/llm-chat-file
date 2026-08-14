# Quick Start

## Installation

```bash
npm install @johannes.latzel/llm-chat-file
```

## Configure and explore

Set up your workspace with read and write directories via environment variables, then list what's available:

```typescript
import { Workspace, DirectoryConfiguration } from '@johannes.latzel/llm-chat-workspace';
import { FileAccessInfoTool, FileConfiguration } from '@johannes.latzel/llm-chat-file';

const ws = new Workspace(new DirectoryConfiguration());
const tool = new FileAccessInfoTool(ws, new FileConfiguration());

const result = await tool.execute({});
console.log(result.result);
// "Configured file system access:
//   /home/user/project                                       write  (current workspace)
//   /shared/data                                              read
// max chars per file: 100000"
```

## Read and write files

Reuse the same `Workspace` across tools, no need to reconfigure each time:

```typescript
import { ReadFileTool, WriteFileTool } from '@johannes.latzel/llm-chat-file';

const read = new ReadFileTool(ws);
const write = new WriteFileTool(ws);

await write.execute({ path: 'notes.txt', content: 'Hello from llm-chat-file!' });
const result = await read.execute({ paths: ['notes.txt'] });
console.log(result.result);
```

## Search for files and content

Find `.ts` files containing "TODO", or search by name, content, and timestamps in one call:

```typescript
import { SearchEntriesTool } from '@johannes.latzel/llm-chat-file';

const search = new SearchEntriesTool(ws);
const result = await search.execute({ name_pattern: '\\.ts$', content_pattern: 'TODO' });
console.log(result.result);
// "src/main.ts:10:   // TODO: implement this"
```

## Register with a chat service

Use `FileToolPackage` to bundle all 13 tools at once, including subfile editing tools (`replace_file_lines`, `insert_file_content`, `replace_file_content`):

```typescript
import { ToolSuite } from '@johannes.latzel/llm-chat';
import { FileToolPackage } from '@johannes.latzel/llm-chat-file';
import { Workspace, DirectoryConfiguration } from '@johannes.latzel/llm-chat-workspace';

const ws = new Workspace(new DirectoryConfiguration());
const pkg = new FileToolPackage(ws);
const suite = new ToolSuite();
suite.add(pkg);

// Pass suite.tools() to a ChatService constructor
```

Or register individual tools as needed, see the [API Reference](api-reference.md) for all 13.

## Next steps

- Browse the [API Reference](api-reference.md) for every tool's parameters and return values
- See [Architecture](architecture.md) for the design behind workspace access control
