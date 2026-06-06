import {
    PartialToolResult,
    ResultStatus,
    Tool,
    ToolParameterProperty,
    ToolParameters
} from '@johannes.latzel/llm-chat';
import * as fsp from 'node:fs/promises';
import type { Workspace } from '../lib/workspace.js';

/** Tool that deletes files and directories within the allowed workspace directories. */
export class DeleteFileTool extends Tool {
    private ws: Workspace;

    /**
     * @param workspace - Workspace instance for path resolution and access control.
     */
    constructor(workspace: Workspace) {
        super(
            'delete_file',
            'Deletes a file or empty directory. Use recursive=true to delete non-empty directories and their contents.',
            new ToolParameters(
                {
                    path: new ToolParameterProperty('File or directory path'),
                    recursive: new ToolParameterProperty(
                        'Delete directories and their contents recursively'
                    )
                },
                ['path']
            )
        );
        this.ws = workspace;
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

        let stat;
        try {
            stat = await fsp.stat(resolved);
        } catch {
            return { result: 'Path does not exist', status: ResultStatus.Error };
        }

        const label = stat.isDirectory() ? 'directory' : 'file';
        const recursive = args.recursive === true;

        try {
            if (stat.isDirectory() && !recursive) {
                await fsp.rmdir(resolved);
            } else {
                await fsp.rm(resolved, { recursive: true });
            }
            return { result: `Deleted ${label}: ${resolved}`, status: ResultStatus.Success };
        } catch (e) {
            return {
                result: `Error deleting ${label}: ${(e as Error).message}`,
                status: ResultStatus.Error
            };
        }
    }
}
