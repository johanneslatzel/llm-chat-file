import { PartialToolResult, ResultStatus, Tool, ToolParameters } from '@johannes.latzel/llm-chat';
import type { Workspace } from '../lib/workspace.js';

/** Tool that reports which directories are accessible and their access levels. */
export class FileAccessInfoTool extends Tool {
    private ws: Workspace;

    /**
     * @param workspace - Workspace instance providing access configuration.
     */
    constructor(workspace: Workspace) {
        super(
            'file_access_info',
            'Returns a list of all configured directories with their access levels (read/write) and indicates which one is the current workspace path. Use this to discover which parts of the filesystem are available for reading and writing.',
            new ToolParameters({}, [])
        );
        this.ws = workspace;
    }

    protected async onExecute(_args: Record<string, unknown>): Promise<PartialToolResult> {
        const accesses = this.ws.getAccesses();
        const current = this.ws.currentPath;

        const lines: string[] = ['Configured file system access:'];
        for (const a of accesses) {
            const marker = a.path === current ? '  (current workspace)' : '';
            lines.push(`  ${a.path.padEnd(60)} ${a.type}${marker}`);
        }

        return { result: lines.join('\n'), status: ResultStatus.Success };
    }
}
