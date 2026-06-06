import {
    PartialToolResult,
    ResultStatus,
    Tool,
    ToolParameterProperty,
    ToolParameters
} from '@johannes.latzel/llm-chat';
import * as fsp from 'node:fs/promises';
import type { Workspace } from '../lib/workspace.js';

/** Tool that creates directories within the allowed workspace directories. */
export class CreateFolderTool extends Tool {
    private ws: Workspace;

    /**
     * @param workspace - Workspace instance for path resolution and access control.
     */
    constructor(workspace: Workspace) {
        super(
            'create_folder',
            'Creates a directory and any necessary parent directories.',
            new ToolParameters(
                {
                    path: new ToolParameterProperty('Directory path')
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

        try {
            await fsp.mkdir(resolved, { recursive: true });
            return { result: `Created directory: ${resolved}/`, status: ResultStatus.Success };
        } catch (e) {
            return {
                result: `Error creating directory: ${(e as Error).message}`,
                status: ResultStatus.Error
            };
        }
    }
}
