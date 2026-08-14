import {
    PartialToolResult,
    PropertyType,
    ResultStatus,
    Tool,
    ToolParameterProperty,
    ToolParameters
} from '@johannes.latzel/llm-chat';
import * as fsp from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { FileConfiguration } from '../lib/config.js';
import { FilePool } from '../lib/file-pool.js';
import { isBinary } from '../lib/helpers.js';
import type { Workspace } from '@johannes.latzel/llm-chat-workspace';

/**
 * Tool that inserts new text content at a specific line in an existing text file
 * without overwriting existing content.
 *
 * Use "line" (1-indexed) to insert before a given line. Omit line to append at
 * end of file. File must already exist.
 */
export class InsertFileContentTool extends Tool {
    private ws: Workspace;
    private fc: FileConfiguration;
    private filePool: FilePool | undefined;

    /**
     * @param workspace - The workspace for path resolution and access checks.
     * @param fileConfig - Configuration for file size and character limits.
     * @param filePool - Optional pool for enforcing read-before-write checks.
     */
    constructor(workspace: Workspace, fileConfig?: FileConfiguration, filePool?: FilePool) {
        super(
            'insert_file_content',
            'Inserts new text content at a specific line in an existing text file without overwriting existing content. Use "line" (1-indexed) to insert before a given line. Omit line to append at end of file. File must already exist.',
            new ToolParameters(
                {
                    path: new ToolParameterProperty(
                        'File path (absolute, or relative to workspace root)'
                    ),
                    content: new ToolParameterProperty('Text content to insert'),
                    line: new ToolParameterProperty(
                        'Insert content before this line number (1-indexed). Omit to append at end of file.',
                        PropertyType.Integer
                    )
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
            return { result: 'Path must be a non-empty string', status: ResultStatus.Error };
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

        let stat: Stats;
        try {
            stat = await fsp.stat(resolved);
        } catch (e) {
            return {
                result: `File not found: ${(e as Error).message}`,
                status: ResultStatus.Error
            };
        }
        if (!stat.isFile()) {
            return { result: 'Path is not a file', status: ResultStatus.Error };
        }
        if (stat.size > this.fc.maxFileSize) {
            return {
                result: `File too large (${stat.size} bytes, max ${this.fc.maxFileSize})`,
                status: ResultStatus.Error
            };
        }
        if (await isBinary(resolved)) {
            return {
                result: 'File appears to be binary; this tool works with text files only',
                status: ResultStatus.Error
            };
        }

        const readCheck = await this.filePool?.verifyWrite(resolved);
        if (readCheck) return readCheck;

        try {
            const fileContent = await fsp.readFile(resolved, 'utf-8');
            const lines = fileContent.split('\n');

            const line = typeof args.line === 'number' ? Math.floor(args.line) : lines.length + 1;
            if (line < 1 || line > lines.length + 1) {
                return {
                    result: `line (${line}) out of range: file has ${lines.length} lines, must be between 1 and ${lines.length + 1}`,
                    status: ResultStatus.Error
                };
            }

            const insertLines = content.split('\n');
            const result = [
                ...lines.slice(0, line - 1),
                ...insertLines,
                ...lines.slice(line - 1)
            ].join('\n');

            if (result.length > this.fc.maxCharsPerFile) {
                return {
                    result: `Resulting file would be ${result.length} chars, exceeds max length of ${this.fc.maxCharsPerFile}`,
                    status: ResultStatus.Error
                };
            }

            await fsp.writeFile(resolved, result, 'utf-8');
            await this.filePool?.recordWrite(resolved);
            const range =
                insertLines.length > 1
                    ? `lines ${line}-${line + insertLines.length - 1}`
                    : `line ${line}`;
            return {
                result: `Inserted content at ${range} in ${resolved}`,
                status: ResultStatus.Success
            };
        } catch (e) {
            return {
                result: `Error inserting content: ${(e as Error).message}`,
                status: ResultStatus.Error
            };
        }
    }
}
