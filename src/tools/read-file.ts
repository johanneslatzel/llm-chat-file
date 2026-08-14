import {
    PartialToolResult,
    PropertyType,
    ResultBuilder,
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

/** Tool that reads the contents of a text file within the allowed workspace directories. */
const TRUNCATION_SUFFIX = '\n... [truncated]';

export class ReadFileTool extends Tool {
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
            'read_file',
            'Reads the full contents of one or more text files. Supports optional line ranges (start_line/end_line, 1-indexed) to read specific sections only. Pass an array of file paths ("paths"). Paths can be absolute or relative to workspace root.',
            new ToolParameters(
                {
                    paths: new ToolParameterProperty(
                        'Array of file paths to read (absolute, or relative to workspace root)',
                        PropertyType.Array
                    ),
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
                ['paths']
            )
        );
        this.ws = workspace;
        this.fc = fileConfig ?? new FileConfiguration();
        this.filePool = filePool;
    }

    protected async onExecute(args: Record<string, unknown>): Promise<PartialToolResult> {
        const rawPaths = args.paths;
        if (!Array.isArray(rawPaths)) {
            return { result: '"paths" must be an array of strings', status: ResultStatus.Error };
        }

        if (rawPaths.length === 0) {
            return { result: '"paths" must be a non-empty array', status: ResultStatus.Error };
        }

        const maxChars =
            typeof args.max_chars === 'number'
                ? Math.max(1, Math.min(args.max_chars, this.fc.maxCharsPerFile))
                : this.fc.maxCharsPerFile;
        const startLine =
            typeof args.start_line === 'number' ? Math.max(1, args.start_line) : undefined;
        const endLine =
            typeof args.end_line === 'number' && args.end_line > 0 ? args.end_line : undefined;

        return await ResultBuilder.resolveAll(
            rawPaths.map((p) => this.readSingleFile(p, maxChars, startLine, endLine))
        );
    }

    private async readSingleFile(
        rawPath: unknown,
        maxChars: number,
        startLine?: number,
        endLine?: number
    ): Promise<PartialToolResult> {
        if (typeof rawPath !== 'string' || !rawPath.trim()) {
            return { result: 'Path must be a non-empty string', status: ResultStatus.Error };
        }
        const resolved = this.ws.normalize(rawPath.trim());
        if (!this.ws.canRead(resolved)) {
            return {
                result: `Invalid or inaccessible path${this.ws.pathHint(rawPath, resolved)}`,
                status: ResultStatus.Error
            };
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
            return { result: `Path is not a file: ${resolved}`, status: ResultStatus.Error };
        }

        if (stat.size > this.fc.maxFileSize) {
            return {
                result: `File too large (${stat.size} bytes, max ${this.fc.maxFileSize}): ${resolved}`,
                status: ResultStatus.Error
            };
        }

        if (await isBinary(resolved)) {
            return {
                result: `File appears to be binary; use read_file for text files only: ${resolved}`,
                status: ResultStatus.Error
            };
        }

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
            await this.filePool?.recordRead(resolved);
            return {
                result: `--- ${resolved} (lines ${sliceStart + 1}-${Math.min(sliceEnd, lines.length)} of ${lines.length}, ${content.length} chars) ---\n${result}`,
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
