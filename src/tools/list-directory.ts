import {
    PartialToolResult,
    PropertyType,
    ResultStatus,
    Tool,
    ToolParameterProperty,
    ToolParameters
} from '@johannes.latzel/llm-chat';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { Stats } from 'node:fs';
import { SearchConfiguration } from '../lib/config.js';
import type { Workspace } from '@johannes.latzel/llm-chat-workspace';

/** Tool that lists files and directories in a given path within the workspace. */
export class ListDirectoryTool extends Tool {
    private ws: Workspace;
    private sc: SearchConfiguration;

    /**
     * @param workspace - Workspace instance for path resolution and access control.
     * @param config - Optional search configuration (display/total entry limits). Defaults to a new `SearchConfiguration`.
     */
    constructor(workspace: Workspace, config?: SearchConfiguration) {
        super(
            'list_directory',
            'Lists files and directories in a path. Returns one entry per line; directories are suffixed with "/". Paths can be absolute or relative to workspace root.',
            new ToolParameters(
                {
                    path: new ToolParameterProperty(
                        'Directory path (absolute, or relative to workspace root)'
                    ),
                    recursive: new ToolParameterProperty(
                        'Set to true to list recursively depth-first',
                        PropertyType.Boolean
                    )
                },
                ['path']
            )
        );
        this.ws = workspace;
        this.sc = config ?? new SearchConfiguration();
    }

    protected async onExecute(args: Record<string, unknown>): Promise<PartialToolResult> {
        const raw = args.path;
        if (typeof raw !== 'string' || !raw.trim()) {
            return { result: 'Invalid or inaccessible path', status: ResultStatus.Error };
        }
        const resolved = this.ws.normalize(raw.trim());
        if (!this.ws.canRead(resolved)) {
            return {
                result: `Invalid or inaccessible path${this.ws.pathHint(raw.trim(), resolved)}`,
                status: ResultStatus.Error
            };
        }

        let stat: Stats;
        try {
            stat = await fsp.stat(resolved);
        } catch (e) {
            return {
                result: `Path not found: ${(e as Error).message}`,
                status: ResultStatus.Error
            };
        }
        if (!stat.isDirectory()) {
            return { result: 'Path is not a directory', status: ResultStatus.Error };
        }

        const recursive = args.recursive === true;
        const entries: string[] = [];
        let totalEntries = 0;
        let totalFiles = 0;
        let totalDirs = 0;

        const walkErrors: string[] = [];
        try {
            if (recursive) {
                for await (const entry of this.ws.walk(resolved, (dirPath, _err) => {
                    walkErrors.push(dirPath);
                })) {
                    totalEntries++;
                    if (entry.dirent.isDirectory()) totalDirs++;
                    else totalFiles++;

                    if (totalEntries >= this.sc.maxTotalEntries) {
                        const ew =
                            walkErrors.length > 0
                                ? `(Warning: could not read ${walkErrors.length} director${walkErrors.length === 1 ? 'y' : 'ies'}, listing may be incomplete)\n\n`
                                : '';
                        return {
                            result: `${ew}Directory contains too many entries (${totalEntries}), refusing to list`,
                            status: ResultStatus.Error
                        };
                    }

                    if (totalEntries <= this.sc.maxDisplayEntries) {
                        entries.push(
                            entry.dirent.isDirectory() ? entry.filePath + '/' : entry.filePath
                        );
                    }
                }
            } else {
                const dir = await fsp.readdir(resolved, { withFileTypes: true });
                const filtered = dir.filter(
                    (d) => !d.isDirectory() || !this.ws.skipDirs.includes(d.name)
                );
                totalEntries = filtered.length;
                totalFiles = filtered.filter((d) => d.isFile()).length;
                totalDirs = totalEntries - totalFiles;

                if (totalEntries >= this.sc.maxTotalEntries) {
                    return {
                        result: `Directory contains too many entries (${totalEntries}), refusing to list`,
                        status: ResultStatus.Error
                    };
                }

                if (totalEntries <= this.sc.maxDisplayEntries) {
                    for (const d of filtered) {
                        const fullPath = path.join(resolved, d.name);
                        entries.push(d.isDirectory() ? fullPath + '/' : fullPath);
                    }
                }
            }

            const errorWarning =
                recursive && walkErrors.length > 0
                    ? `(Warning: could not read ${walkErrors.length} director${walkErrors.length === 1 ? 'y' : 'ies'}, listing may be incomplete)\n\n`
                    : '';

            if (totalEntries > this.sc.maxDisplayEntries) {
                return {
                    result: `${errorWarning}Found ${totalFiles} files and ${totalDirs} directories`,
                    status: ResultStatus.Success
                };
            }

            if (entries.length === 0) {
                return {
                    result: `${errorWarning}(empty directory)`,
                    status: ResultStatus.Success
                };
            }
            return {
                result: errorWarning + entries.join('\n'),
                status: ResultStatus.Success
            };
        } catch (e) {
            return {
                result: `Error listing directory: ${(e as Error).message}`,
                status: ResultStatus.Error
            };
        }
    }
}
