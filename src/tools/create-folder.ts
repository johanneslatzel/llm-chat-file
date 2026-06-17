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
            'Creates directories and any necessary parent directories. Paths can be absolute or relative to workspace root.',
            new ToolParameters(
                {
                    paths: new ToolParameterProperty(
                        'Array of directory paths to create',
                        PropertyType.Array
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

        return await ResultBuilder.resolveAll(rawPaths.map((p) => this.createSingle(p)));
    }

    private async createSingle(raw: unknown): Promise<PartialToolResult> {
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
