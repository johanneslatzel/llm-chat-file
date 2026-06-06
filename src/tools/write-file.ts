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
import type { Workspace } from '../lib/workspace.js';

/** Tool that writes text content to a file within the allowed workspace directories. */
export class WriteFileTool extends Tool {
    private ws: Workspace;
    private fc: FileConfiguration;

    /**
     * @param workspace - Workspace instance for path resolution and access control.
     * @param fileConfig - Optional file configuration (character limits). Defaults to a new `FileConfiguration`.
     */
    constructor(workspace: Workspace, fileConfig?: FileConfiguration) {
        super(
            'write_file',
            'Writes text content to a file. Creates parent directories automatically. Only for text files.',
            new ToolParameters(
                {
                    path: new ToolParameterProperty('File path'),
                    content: new ToolParameterProperty('Text content to write')
                },
                ['path', 'content']
            )
        );
        this.ws = workspace;
        this.fc = fileConfig ?? new FileConfiguration();
    }

    protected async onExecute(args: Record<string, unknown>): Promise<PartialToolResult> {
        const raw = args.path;
        if (typeof raw !== 'string' || !raw.trim()) {
            return { result: 'Invalid or inaccessible path', status: ResultStatus.Error };
        }
        const resolved = this.ws.normalize(raw.trim());
        if (!this.ws.canWrite(resolved)) {
            return {
                result: 'Invalid or inaccessible path (must be within writable directory)',
                status: ResultStatus.Error
            };
        }
        const content = args.content;
        if (typeof content !== 'string') {
            return { result: 'content must be a string', status: ResultStatus.Error };
        }
        if (content.length > this.fc.maxCharsPerFile) {
            return {
                result: `Content exceeds max length of ${this.fc.maxCharsPerFile}`,
                status: ResultStatus.Error
            };
        }

        try {
            await fsp.mkdir(path.dirname(resolved), { recursive: true });
            await fsp.writeFile(resolved, content, 'utf-8');
            return { result: `Written: ${resolved}`, status: ResultStatus.Success };
        } catch (e) {
            return {
                result: `Error writing file: ${(e as Error).message}`,
                status: ResultStatus.Error
            };
        }
    }
}
