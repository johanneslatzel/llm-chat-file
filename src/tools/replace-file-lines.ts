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
 * Tool that replaces a range of lines in an existing text file with new content.
 *
 * Uses start_line/end_line (1-indexed, inclusive) to specify the range.
 * Empty content deletes the range. File must already exist.
 */
export class ReplaceFileLinesTool extends Tool {
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
            'replace_file_lines',
            'Replaces a range of lines in an existing text file with new content (partial edit, unlike write_file which overwrites the whole file). Uses start_line/end_line (1-indexed, inclusive) to specify the range. Empty content deletes the range. File must already exist.',
            new ToolParameters(
                {
                    path: new ToolParameterProperty(
                        'File path (absolute, or relative to workspace root)'
                    ),
                    content: new ToolParameterProperty(
                        'Text content to replace the lines with (empty string deletes the range)'
                    ),
                    start_line: new ToolParameterProperty(
                        'First line number to replace (1-indexed, inclusive)',
                        PropertyType.Integer
                    ),
                    end_line: new ToolParameterProperty(
                        'Last line number to replace (1-indexed, inclusive). Defaults to start_line.',
                        PropertyType.Integer
                    )
                },
                ['path', 'content', 'start_line']
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

        if (typeof args.start_line !== 'number') {
            return { result: 'start_line must be a number', status: ResultStatus.Error };
        }
        const startLine = Math.floor(args.start_line);
        if (startLine < 1) {
            return { result: 'start_line must be >= 1', status: ResultStatus.Error };
        }

        const endLine = typeof args.end_line === 'number' ? Math.floor(args.end_line) : startLine;
        if (endLine < startLine) {
            return { result: 'end_line must be >= start_line', status: ResultStatus.Error };
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

            if (startLine > lines.length) {
                return {
                    result: `start_line (${startLine}) exceeds file length (${lines.length} lines)`,
                    status: ResultStatus.Error
                };
            }
            if (endLine > lines.length) {
                return {
                    result: `end_line (${endLine}) exceeds file length (${lines.length} lines)`,
                    status: ResultStatus.Error
                };
            }

            const newLines = content === '' ? [] : content.split('\n');
            const result = [
                ...lines.slice(0, startLine - 1),
                ...newLines,
                ...lines.slice(endLine)
            ].join('\n');

            if (result.length > this.fc.maxCharsPerFile) {
                return {
                    result: `Resulting file would be ${result.length} chars, exceeds max length of ${this.fc.maxCharsPerFile}`,
                    status: ResultStatus.Error
                };
            }

            await fsp.writeFile(resolved, result, 'utf-8');
            await this.filePool?.recordWrite(resolved);
            return {
                result: `Replaced lines ${startLine}-${endLine} in ${resolved}`,
                status: ResultStatus.Success
            };
        } catch (e) {
            return {
                result: `Error editing file: ${(e as Error).message}`,
                status: ResultStatus.Error
            };
        }
    }
}
