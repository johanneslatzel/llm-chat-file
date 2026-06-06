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
import { isBinary } from '../lib/helpers.js';
import type { Workspace } from '../lib/workspace.js';

/** Tool that reads the contents of a text file within the allowed workspace directories. */
const TRUNCATION_SUFFIX = '\n... [truncated]';

export class ReadFileTool extends Tool {
    private ws: Workspace;
    private fc: FileConfiguration;

    /**
     * @param workspace - Workspace instance for path resolution and access control.
     * @param fileConfig - Optional file configuration (character limits). Defaults to a new `FileConfiguration`.
     */
    constructor(workspace: Workspace, fileConfig?: FileConfiguration) {
        super(
            'read_file',
            'Reads the contents of a text file. Supports optional max characters and line ranges (start_line/end_line, 1-indexed).',
            new ToolParameters(
                {
                    path: new ToolParameterProperty('File path'),
                    max_chars: new ToolParameterProperty(
                        'Maximum number of characters to return (default: config max)',
                        PropertyType.Integer
                    ),
                    start_line: new ToolParameterProperty(
                        'First line number to read (1-indexed, inclusive)',
                        PropertyType.Integer
                    ),
                    end_line: new ToolParameterProperty(
                        'Last line number to read (1-indexed, inclusive)',
                        PropertyType.Integer
                    )
                },
                ['path']
            )
        );
        this.ws = workspace;
        this.fc = fileConfig ?? new FileConfiguration();
    }

    protected async onExecute(args: Record<string, unknown>): Promise<PartialToolResult> {
        const raw = args.path;
        if (typeof raw !== 'string' || !raw.trim()) {
            return { result: 'Path must be a non-empty string', status: ResultStatus.Error };
        }
        const resolved = this.ws.normalize(raw.trim());
        if (!this.ws.canRead(resolved)) {
            return { result: 'Invalid or inaccessible path', status: ResultStatus.Error };
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
                result: 'File appears to be binary; use read_file for text files only',
                status: ResultStatus.Error
            };
        }

        const maxChars =
            typeof args.max_chars === 'number'
                ? Math.max(1, Math.min(args.max_chars, this.fc.maxCharsPerFile))
                : this.fc.maxCharsPerFile;
        const startLine =
            typeof args.start_line === 'number' ? Math.max(1, args.start_line) : undefined;
        const endLine =
            typeof args.end_line === 'number' && args.end_line > 0 ? args.end_line : undefined;

        try {
            const content = await fsp.readFile(resolved, 'utf-8');
            const lines = content.split('\n');
            const sliceStart = startLine ? startLine - 1 : 0;
            const sliceEnd = endLine ? Math.min(endLine, lines.length) : lines.length;
            const sliced = lines.slice(sliceStart, sliceEnd);
            let result = sliced.join('\n');
            if (result.length > maxChars) {
                result = result.slice(0, maxChars - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
            }
            return {
                result: `--- ${resolved} (lines ${sliceStart + 1}-${Math.min(sliceEnd, lines.length)} of ${lines.length}) ---\n${result}`,
                status: ResultStatus.Success
            };
        } catch (e) {
            return {
                result: `Error reading file: ${(e as Error).message}`,
                status: ResultStatus.Error
            };
        }
    }
}
