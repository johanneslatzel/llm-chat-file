import { PartialToolResult, ResultStatus, Tool, ToolParameters } from '@johannes.latzel/llm-chat';
import type { Workspace } from '@johannes.latzel/llm-chat-workspace';
import { FileConfiguration } from '../lib/config.js';

/** Tool that reports which directories are accessible and their access levels. */
export class FileAccessInfoTool extends Tool {
    private ws: Workspace;
    private fc: FileConfiguration;

    /**
     * @param workspace - Workspace instance providing access configuration.
     * @param fileConfig - File configuration (character limits) actually enforced by the read/write tools.
     */
    constructor(workspace: Workspace, fileConfig: FileConfiguration) {
        super(
            'file_access_info',
            'Returns a list of all configured directories with their access levels (read/write) and indicates which one is the current workspace path. Use this to discover which parts of the filesystem are available for reading and writing.',
            new ToolParameters({}, [])
        );
        this.ws = workspace;
        this.fc = fileConfig;
    }

    protected async onExecute(_args: Record<string, unknown>): Promise<PartialToolResult> {
        const accesses = this.ws.getAccesses();
        const current = this.ws.currentPath;

        const lines: string[] = ['Configured file system access:'];
        for (const a of accesses) {
            const marker = a.path === current ? '  (current workspace)' : '';
            lines.push(`  ${a.path.padEnd(60)} ${a.type}${marker}`);
        }
        lines.push(`max chars per file: ${this.fc.maxCharsPerFile}`);

        return { result: lines.join('\n'), status: ResultStatus.Success };
    }
}
