import {
    PartialToolResult,
    ResultStatus,
    Tool,
    ToolParameterProperty,
    ToolParameters
} from '@johannes.latzel/llm-chat';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { FileConfiguration } from '../lib/config.js';
import { FilePool } from '../lib/file-pool.js';
import type { Workspace } from '@johannes.latzel/llm-chat-workspace';

/** Tool that writes text content to a file within the allowed workspace directories. */
export class WriteFileTool extends Tool {
    private ws: Workspace;
    private fc: FileConfiguration;
    private filePool: FilePool | undefined;

    /**
     * @param workspace - Workspace instance for path resolution and access control.
     * @param fileConfig - Optional file configuration (character limits). Defaults to a new `FileConfiguration`.
     * @param filePool - Optional shared file pool for read-before-write tracking.
     */
    constructor(workspace: Workspace, fileConfig?: FileConfiguration, filePool?: FilePool) {
        super(
            'write_file',
            'Creates a new file or overwrites the entire content of an existing text file. For partial edits (line range or substring replacement) use replace_file_lines, insert_file_content, or replace_file_content instead. Creates parent directories automatically. Only for text files. Paths can be absolute or relative to workspace root.',
            new ToolParameters(
                {
                    path: new ToolParameterProperty(
                        'File path (absolute, or relative to workspace root)'
                    ),
                    content: new ToolParameterProperty('Text content to write')
                },
                ['path', 'content']
            )
        );
        this.ws = workspace;
        this.fc = fileConfig ?? new FileConfiguration();
        this.filePool = filePool;
    }

    protected async onExecute(args: Record<string, unknown>): Promise<PartialToolResult> {
        const raw = args.path;
        if (typeof raw !== 'string' || !raw.trim()) {
            return { result: 'Invalid or inaccessible path', status: ResultStatus.Error };
        }
        const resolved = this.ws.normalize(raw.trim());
        if (!this.ws.canWrite(resolved)) {
            return {
                result: `Invalid or inaccessible path (must be within writable directory)${this.ws.pathHint(raw, resolved)}`,
                status: ResultStatus.Error
            };
        }
        const content = args.content;
        if (typeof content !== 'string') {
            return { result: 'content must be a string', status: ResultStatus.Error };
        }
        if (content.length > this.fc.maxCharsPerFile) {
            return {
                result: `Content argument is ${content.length} chars, exceeds max length of ${this.fc.maxCharsPerFile}`,
                status: ResultStatus.Error
            };
        }

        const readCheck = await this.filePool?.verifyWrite(resolved, true);
        if (readCheck) return readCheck;

        try {
            await fsp.mkdir(path.dirname(resolved), { recursive: true });
            await fsp.writeFile(resolved, content, 'utf-8');
            await this.filePool?.recordWrite(resolved);
            return { result: `Written: ${resolved}`, status: ResultStatus.Success };
        } catch (e) {
            return {
                result: `Error writing file: ${(e as Error).message}`,
                status: ResultStatus.Error
            };
        }
    }
}
