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
import type { Workspace } from '../lib/workspace.js';

/**
 * Tool that replaces an exact substring in one or more existing text files
 * with new content (partial edit, unlike write_file which overwrites the
 * whole file).
 *
 * Use replace_all to replace all occurrences vs only the first.
 * Works like find-and-replace. Files must already exist.
 * The same old_content/new_content is applied to every file in paths.
 */
export class ReplaceFileContentTool extends Tool {
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
            'replace_file_content',
            'Replaces an exact substring in one or more existing text files with new content (partial edit, unlike write_file which overwrites the whole file). Use replace_all to replace all occurrences vs only the first. The same old_content/new_content is applied to every file in paths. Works like find-and-replace. Files must already exist.',
            new ToolParameters(
                {
                    paths: new ToolParameterProperty(
                        'Array of file paths to apply the replacement to',
                        PropertyType.Array
                    ),
                    old_content: new ToolParameterProperty(
                        'Exact substring to find (literal match, not a regex)'
                    ),
                    new_content: new ToolParameterProperty(
                        'Replacement text (empty string deletes the match)'
                    ),
                    replace_all: new ToolParameterProperty(
                        'Replace all occurrences vs first only. Default false.',
                        PropertyType.Boolean
                    )
                },
                ['paths', 'old_content', 'new_content']
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

        const oldContent = args.old_content;
        if (typeof oldContent !== 'string') {
            return { result: 'old_content must be a string', status: ResultStatus.Error };
        }

        const newContent = args.new_content;
        if (typeof newContent !== 'string') {
            return { result: 'new_content must be a string', status: ResultStatus.Error };
        }

        const replaceAll = typeof args.replace_all === 'boolean' ? args.replace_all : false;

        return await ResultBuilder.resolveAll(
            rawPaths.map((p) => this.replaceInFile(p, oldContent, newContent, replaceAll))
        );
    }

    private async replaceInFile(
        raw: unknown,
        oldContent: string,
        newContent: string,
        replaceAll: boolean
    ): Promise<PartialToolResult> {
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

            let result: string;
            if (replaceAll) {
                if (!fileContent.includes(oldContent)) {
                    return {
                        result: 'old_content not found in file',
                        status: ResultStatus.Error
                    };
                }
                result = fileContent.split(oldContent).join(newContent);
            } else {
                const index = fileContent.indexOf(oldContent);
                if (index === -1) {
                    return {
                        result: 'old_content not found in file',
                        status: ResultStatus.Error
                    };
                }
                result =
                    fileContent.slice(0, index) +
                    newContent +
                    fileContent.slice(index + oldContent.length);
            }

            if (result.length > this.fc.maxCharsPerFile) {
                return {
                    result: `Result exceeds max length of ${this.fc.maxCharsPerFile}`,
                    status: ResultStatus.Error
                };
            }

            await fsp.writeFile(resolved, result, 'utf-8');
            await this.filePool?.recordWrite(resolved);
            return {
                result: `Replaced content in ${resolved}`,
                status: ResultStatus.Success
            };
        } catch (e) {
            return {
                result: `Error replacing content: ${(e as Error).message}`,
                status: ResultStatus.Error
            };
        }
    }
}
