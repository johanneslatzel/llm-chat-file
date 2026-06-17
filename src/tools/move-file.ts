import {
    PartialToolResult,
    ResultStatus,
    Tool,
    ToolParameterProperty,
    ToolParameters
} from '@johannes.latzel/llm-chat';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { Workspace } from '../lib/workspace.js';

/** Tool that moves or renames files and directories within the allowed workspace directories. */
export class MoveFileTool extends Tool {
    private ws: Workspace;

    /**
     * @param workspace - Workspace instance for path resolution and access control.
     */
    constructor(workspace: Workspace) {
        super(
            'move_file',
            'Moves or renames a file or directory. Paths can be absolute or relative to workspace root.',
            new ToolParameters(
                {
                    source: new ToolParameterProperty(
                        'Source path (absolute, or relative to workspace root)'
                    ),
                    destination: new ToolParameterProperty(
                        'Destination path (absolute, or relative to workspace root)'
                    )
                },
                ['source', 'destination']
            )
        );
        this.ws = workspace;
    }

    protected async onExecute(args: Record<string, unknown>): Promise<PartialToolResult> {
        const srcRaw = args.source;
        if (typeof srcRaw !== 'string' || !srcRaw.trim()) {
            return {
                result: 'Invalid or inaccessible source path (must be within writable directory)',
                status: ResultStatus.Error
            };
        }
        const src = this.ws.normalize(srcRaw.trim());
        if (!this.ws.canWrite(src)) {
            return {
                result: `Invalid or inaccessible source path (must be within writable directory)${this.ws.pathHint(srcRaw.trim(), src)}`,
                status: ResultStatus.Error
            };
        }

        const destRaw = args.destination;
        if (typeof destRaw !== 'string' || !destRaw.trim()) {
            return {
                result: 'Invalid or inaccessible destination path (must be within writable directory)',
                status: ResultStatus.Error
            };
        }
        const dest = this.ws.normalize(destRaw.trim());
        if (!this.ws.canWrite(dest)) {
            return {
                result: `Invalid or inaccessible destination path (must be within writable directory)${this.ws.pathHint(destRaw.trim(), dest)}`,
                status: ResultStatus.Error
            };
        }

        try {
            const srcStat = await fsp.stat(src);
            if (!srcStat.isFile() && !srcStat.isDirectory()) {
                return { result: 'Source is not a file or directory', status: ResultStatus.Error };
            }
        } catch (e) {
            return {
                result: `Source not found: ${(e as Error).message}`,
                status: ResultStatus.Error
            };
        }

        try {
            await fsp.mkdir(path.dirname(dest), { recursive: true });
            await fsp.rename(src, dest);
            return {
                result: `Moved: ${src} -> ${dest}`,
                status: ResultStatus.Success
            };
        } catch (e) {
            return { result: `Error moving: ${(e as Error).message}`, status: ResultStatus.Error };
        }
    }
}
