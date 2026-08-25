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
import type { Workspace } from '@johannes.latzel/llm-chat-workspace';

/** Tool that deletes files and directories within the allowed workspace directories.
 *
 * Non-empty directories are only deleted when `recursive=true` is passed; without
 * it a refusal message names the option instead of surfacing a bare ENOTEMPTY
 * error. Recursive deletion never follows symlinks out of the deleted tree.
 */
export class DeleteFileTool extends Tool {
    private ws: Workspace;

    /**
     * @param workspace - Workspace instance for path resolution and access control.
     */
    constructor(workspace: Workspace) {
        super(
            'delete_file',
            'Deletes files or empty directories. Use recursive=true to delete non-empty directories and their contents. Paths can be absolute or relative to workspace root.',
            new ToolParameters(
                {
                    paths: new ToolParameterProperty(
                        'Array of file or directory paths to delete',
                        PropertyType.Array
                    ),
                    recursive: new ToolParameterProperty(
                        'Delete directories and their contents recursively',
                        PropertyType.Boolean
                    )
                },
                ['paths']
            )
        );
        this.ws = workspace;
    }

    protected async onExecute(args: Record<string, unknown>): Promise<PartialToolResult> {
        const rawPaths = args.paths;
        if (!Array.isArray(rawPaths)) {
            return { result: '"paths" must be an array of strings', status: ResultStatus.Error };
        }
        if (rawPaths.length === 0) {
            return { result: '"paths" must be a non-empty array', status: ResultStatus.Error };
        }

        const recursive = args.recursive === true;
        return await ResultBuilder.resolveAll(rawPaths.map((p) => this.deleteSingle(p, recursive)));
    }

    private async deleteSingle(raw: unknown, recursive: boolean): Promise<PartialToolResult> {
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

        let stat;
        try {
            stat = await fsp.stat(resolved);
        } catch {
            return { result: 'Path does not exist', status: ResultStatus.Error };
        }

        const label = stat.isDirectory() ? 'directory' : 'file';
        try {
            if (stat.isDirectory() && !recursive) {
                await fsp.rmdir(resolved);
            } else {
                await fsp.rm(resolved, { recursive: true });
            }
            return { result: `Deleted ${label}: ${resolved}`, status: ResultStatus.Success };
        } catch (e) {
            const err = e as NodeJS.ErrnoException;
            if (err.code === 'ENOTEMPTY' && !recursive) {
                return {
                    result: `Directory not empty: '${resolved}'. Use recursive=true to delete directories and their contents.`,
                    status: ResultStatus.Error
                };
            }
            return {
                result: `Error deleting ${label}: ${err.message}`,
                status: ResultStatus.Error
            };
        }
    }
}
