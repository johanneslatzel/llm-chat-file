import {
    PartialToolResult,
    ResultStatus,
    Tool,
    ToolParameterProperty,
    ToolParameters
} from '@johannes.latzel/llm-chat';
import type { Workspace } from '../lib/workspace.js';

/** Tool that changes the current workspace path to a new directory within configured accessible directories. */
export class SwitchWorkspaceTool extends Tool {
    private ws: Workspace;

    /**
     * @param workspace - Workspace instance for path resolution and workspace switching.
     */
    constructor(workspace: Workspace) {
        super(
            'switch_workspace',
            'Changes the current workspace path to a new directory within configured accessible directories. Must be called before any other filesystem tool when changing workspace. Do NOT call this tool in parallel with any other filesystem tool — call it first, then call the other tools sequentially.',
            new ToolParameters(
                {
                    path: new ToolParameterProperty('Target directory path')
                },
                ['path']
            )
        );
        this.ws = workspace;
    }

    protected async onExecute(args: Record<string, unknown>): Promise<PartialToolResult> {
        const raw = args.path;
        if (typeof raw !== 'string' || !raw.trim()) {
            return { result: 'path must be a non-empty string', status: ResultStatus.Error };
        }
        try {
            await this.ws.switchWorkspace(raw.trim());
            return {
                result: `Switched workspace to: ${this.ws.currentPath}`,
                status: ResultStatus.Success
            };
        } catch (e) {
            return {
                result: (e as Error).message,
                status: ResultStatus.Error
            };
        }
    }
}
