# Quick Start

## Installation

```bash
npm install @johannes.latzel/llm-chat-file
```

## Configure and explore

Set up your workspace with read and write directories via environment variables, then list what's available:

```typescript
import { Workspace, DirectoryConfiguration } from '@johannes.latzel/llm-chat-file';
import { FileAccessInfoTool } from '@johannes.latzel/llm-chat-file';

const ws = new Workspace(new DirectoryConfiguration());
const tool = new FileAccessInfoTool(ws);

const result = await tool.execute({});
console.log(result.result);
// "Configured file system access:
//   /home/user/project                                       write  (current workspace)
//   /shared/data                                              read"
```

## Read and write files

Reuse the same `Workspace` across tools — no need to reconfigure each time:

```typescript
import { ReadFileTool, WriteFileTool } from '@johannes.latzel/llm-chat-file';

const read = new ReadFileTool(ws);
const write = new WriteFileTool(ws);

await write.execute({ path: 'notes.txt', content: 'Hello from llm-chat-file!' });
const result = await read.execute({ path: 'notes.txt' });
console.log(result.result);
```

## Search for files and content

Find `.ts` files containing "TODO" — or search by name, content, and timestamps in one call:

```typescript
import { SearchEntriesTool } from '@johannes.latzel/llm-chat-file';

const search = new SearchEntriesTool(ws);
const result = await search.execute({ name_pattern: '\\.ts$', content_pattern: 'TODO' });
console.log(result.result);
// "src/main.ts:10:   // TODO: implement this"
```

## Register with a chat service

Wire all the tools into an `llm-chat` `ChatService`:

```typescript
import { ToolSuite } from '@johannes.latzel/llm-chat';
import {
    ReadFileTool,
    WriteFileTool,
    SearchEntriesTool,
    ListDirectoryTool,
    CreateFolderTool,
    DeleteFileTool,
    MoveFileTool,
    EntryInfoTool,
    SwitchWorkspaceTool,
    FileAccessInfoTool,
} from '@johannes.latzel/llm-chat-file';

const suite = new ToolSuite();
suite.add(new ReadFileTool(ws));
suite.add(new WriteFileTool(ws));
suite.add(new SearchEntriesTool(ws));
suite.add(new ListDirectoryTool(ws));
suite.add(new CreateFolderTool(ws));
suite.add(new DeleteFileTool(ws));
suite.add(new MoveFileTool(ws));
suite.add(new EntryInfoTool(ws));
suite.add(new SwitchWorkspaceTool(ws));
suite.add(new FileAccessInfoTool(ws));

// Pass suite.tools() to your ChatService constructor
```

## Next steps

- Browse the [API Reference](api-reference.md) for every tool's parameters and return values
- See [Architecture](architecture.md) for the design behind workspace access control
