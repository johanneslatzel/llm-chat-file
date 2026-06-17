import {
    PartialToolResult,
    PropertyType,
    ResultStatus,
    Tool,
    ToolParameterProperty,
    ToolParameters
} from '@johannes.latzel/llm-chat';
import * as fsp from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { FileConfiguration, SearchConfiguration } from '../lib/config.js';
import { isBinary } from '../lib/helpers.js';
import type { Workspace } from '../lib/workspace.js';

enum SearchType {
    File = 'file',
    Directory = 'directory',
    Both = 'both'
}

function parseType(raw: unknown): SearchType | null {
    if (raw === SearchType.File) return SearchType.File;
    if (raw === SearchType.Directory) return SearchType.Directory;
    if (raw === undefined || raw === null) return SearchType.Both;
    return null;
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: PartialToolResult };

interface DateFilters {
    createdAfter: Date | undefined;
    createdBefore: Date | undefined;
    modifiedAfter: Date | undefined;
    modifiedBefore: Date | undefined;
    hasTimestampFilter: boolean;
}

/** Tool that searches for files and directories by name pattern, content pattern, and/or timestamps within the allowed workspace directories. */
export class SearchEntriesTool extends Tool {
    private ws: Workspace;
    private sc: SearchConfiguration;
    private fc: FileConfiguration;

    /**
     * @param workspace - The workspace for path resolution and access checks.
     * @param searchConfig - Configuration for search result limits and timeouts.
     * @param fileConfig - Configuration for file size and character limits.
     */
    constructor(
        workspace: Workspace,
        searchConfig?: SearchConfiguration,
        fileConfig?: FileConfiguration
    ) {
        super(
            'search_entries',
            'Searches for files and directories by name and/or content pattern. If no pattern is given, returns all entries. File content matches show the matching line; file name matches show the path; directories are suffixed with "/". Paths can be absolute or relative to workspace root (use "." for the workspace root itself).',
            new ToolParameters(
                {
                    path: new ToolParameterProperty(
                        'Directory path (absolute, or relative to workspace root)'
                    ),
                    type: new ToolParameterProperty(
                        'Type of entries to search. Accepted values: "file", "directory", "both" (default).'
                    ),
                    name_pattern: new ToolParameterProperty(
                        'JavaScript regex to match file/directory names against (case-insensitive)'
                    ),
                    content_pattern: new ToolParameterProperty(
                        'JavaScript regex to search file contents (files only, case-insensitive)'
                    ),
                    max_results: new ToolParameterProperty(
                        'Maximum number of results to return',
                        PropertyType.Integer
                    ),
                    max_size: new ToolParameterProperty(
                        'Maximum file size in bytes (capped by configuration max)',
                        PropertyType.Integer
                    ),
                    created_after: new ToolParameterProperty(
                        'ISO date string — files created after this time'
                    ),
                    created_before: new ToolParameterProperty(
                        'ISO date string — files created before this time'
                    ),
                    modified_after: new ToolParameterProperty(
                        'ISO date string — files modified after this time'
                    ),
                    modified_before: new ToolParameterProperty(
                        'ISO date string — files modified before this time'
                    )
                },
                []
            )
        );
        this.ws = workspace;
        this.sc = searchConfig ?? new SearchConfiguration();
        this.fc = fileConfig ?? new FileConfiguration();
    }

    private parseRegex(raw: unknown, label: string): ParseResult<RegExp | undefined> {
        const str = typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
        if (!str) return { ok: true, value: undefined };
        try {
            return { ok: true, value: new RegExp(str, 'iu') };
        } catch (e) {
            return {
                ok: false,
                error: {
                    result: `Invalid ${label} regex: ${(e as Error).message}`,
                    status: ResultStatus.Error
                }
            };
        }
    }

    private resolveSearchDir(raw: unknown): ParseResult<string> {
        if (typeof raw === 'string' && raw.trim()) {
            const dir = this.ws.normalize(raw.trim());
            if (!this.ws.canRead(dir)) {
                return {
                    ok: false,
                    error: {
                        result: `Invalid or inaccessible path${this.ws.pathHint(raw, dir)}`,
                        status: ResultStatus.Error
                    }
                };
            }
            return { ok: true, value: dir };
        }
        return { ok: true, value: this.ws.currentPath };
    }

    private parseDateFilters(args: Record<string, unknown>): ParseResult<DateFilters> {
        const createdAfter =
            typeof args.created_after === 'string' ? new Date(args.created_after) : undefined;
        const createdBefore =
            typeof args.created_before === 'string' ? new Date(args.created_before) : undefined;
        const modifiedAfter =
            typeof args.modified_after === 'string' ? new Date(args.modified_after) : undefined;
        const modifiedBefore =
            typeof args.modified_before === 'string' ? new Date(args.modified_before) : undefined;

        if (createdAfter && isNaN(createdAfter.getTime()))
            return {
                ok: false,
                error: { result: 'Invalid created_after date', status: ResultStatus.Error }
            };
        if (createdBefore && isNaN(createdBefore.getTime()))
            return {
                ok: false,
                error: { result: 'Invalid created_before date', status: ResultStatus.Error }
            };
        if (modifiedAfter && isNaN(modifiedAfter.getTime()))
            return {
                ok: false,
                error: { result: 'Invalid modified_after date', status: ResultStatus.Error }
            };
        if (modifiedBefore && isNaN(modifiedBefore.getTime()))
            return {
                ok: false,
                error: { result: 'Invalid modified_before date', status: ResultStatus.Error }
            };

        return {
            ok: true,
            value: {
                createdAfter,
                createdBefore,
                modifiedAfter,
                modifiedBefore,
                hasTimestampFilter: !!(
                    createdAfter ||
                    createdBefore ||
                    modifiedAfter ||
                    modifiedBefore
                )
            }
        };
    }

    private async processFileEntry(
        entry: { filePath: string; dirent: import('node:fs').Dirent },
        contentRegex: RegExp | undefined,
        dateFilters: DateFilters,
        maxSize: number | undefined,
        maxChars: number,
        maxResults: number,
        results: string[]
    ): Promise<void> {
        const { createdAfter, createdBefore, modifiedAfter, modifiedBefore, hasTimestampFilter } =
            dateFilters;

        let st: Stats | undefined;
        const needsStat = hasTimestampFilter || (contentRegex && maxSize !== undefined);
        if (needsStat) {
            try {
                st = await fsp.stat(entry.filePath);
            } catch {
                return;
            }
        }

        if (contentRegex && maxSize !== undefined && st && st.size > maxSize) return;

        if (hasTimestampFilter && st) {
            if (createdAfter && st.birthtime.getTime() < createdAfter.getTime()) return;
            if (createdBefore && st.birthtime.getTime() > createdBefore.getTime()) return;
            if (modifiedAfter && st.mtime.getTime() < modifiedAfter.getTime()) return;
            if (modifiedBefore && st.mtime.getTime() > modifiedBefore.getTime()) return;
        }

        if (contentRegex) {
            if (await isBinary(entry.filePath)) return;

            try {
                const content = await fsp.readFile(entry.filePath, 'utf-8');
                const truncated = content.slice(0, maxChars);
                const lines = truncated.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (results.length >= maxResults) break;
                    const line = lines[i]!;
                    if (contentRegex.test(line)) {
                        const ts =
                            hasTimestampFilter && st
                                ? `  (created: ${st.birthtime.toISOString()}, modified: ${st.mtime.toISOString()})`
                                : '';
                        results.push(
                            `${entry.filePath}:${i + 1}: ${line.trim().slice(0, 200)}${ts}`
                        );
                    }
                }
            } catch {
                // skip unreadable files
            }
        } else {
            const ts =
                hasTimestampFilter && st
                    ? `  (created: ${st.birthtime.toISOString()}, modified: ${st.mtime.toISOString()})`
                    : '';
            results.push(entry.filePath + ts);
        }
    }

    private formatSearchOutput(
        results: string[],
        visited: number,
        walkErrors: string[]
    ): PartialToolResult {
        const errorWarning =
            walkErrors.length > 0
                ? `(Warning: could not read ${walkErrors.length} director${walkErrors.length === 1 ? 'y' : 'ies'}, results may be incomplete)\n\n`
                : '';

        if (visited > this.sc.maxDisplayEntries) {
            return {
                result: `${errorWarning}Searched ${visited} entries, found ${results.length} matches`,
                status: ResultStatus.Success
            };
        }

        if (results.length === 0) {
            return {
                result: `${errorWarning}No matching entries found`,
                status: ResultStatus.Success
            };
        }

        return {
            result: errorWarning + results.join('\n'),
            status: ResultStatus.Success
        };
    }

    protected async onExecute(args: Record<string, unknown>): Promise<PartialToolResult> {
        const nameResult = this.parseRegex(args.name_pattern, 'name_pattern');
        if (!nameResult.ok) return nameResult.error;

        const contentResult = this.parseRegex(args.content_pattern, 'content_pattern');
        if (!contentResult.ok) return contentResult.error;

        const searchType = parseType(args.type);
        if (searchType === null) {
            return {
                result: 'Invalid type parameter. Accepted values: "file", "directory", "both".',
                status: ResultStatus.Error
            };
        }

        const dirResult = this.resolveSearchDir(args.path);
        if (!dirResult.ok) return dirResult.error;

        const dateResult = this.parseDateFilters(args);
        if (!dateResult.ok) return dateResult.error;

        const maxResults =
            typeof args.max_results === 'number'
                ? Math.max(1, args.max_results)
                : this.sc.maxSearchResults;

        const maxSize =
            typeof args.max_size === 'number'
                ? Math.max(1, Math.min(args.max_size, this.fc.maxFileSize))
                : undefined;

        const nameRegex = nameResult.value;
        const contentRegex = contentResult.value;
        const searchDir = dirResult.value;
        const dateFilters = dateResult.value;
        const deadline = Date.now() + this.sc.timeoutMs;
        const maxChars = this.fc.maxCharsPerFile;

        const results: string[] = [];
        let visited = 0;
        const walkErrors: string[] = [];

        try {
            for await (const entry of this.ws.walk(searchDir, (dirPath) => {
                walkErrors.push(dirPath);
            })) {
                if (Date.now() > deadline) {
                    return {
                        result: `Search timed out after ${visited} entries, found ${results.length} matches`,
                        status: ResultStatus.Success
                    };
                }

                visited++;
                if (visited >= this.sc.maxTotalEntries) {
                    return {
                        result: `Searched too many entries (${visited}), aborting. Found ${results.length} matches.`,
                        status: ResultStatus.Error
                    };
                }

                if (results.length >= maxResults) break;

                const isDir = entry.dirent.isDirectory();
                const isFile = entry.dirent.isFile();

                if (searchType === SearchType.File && !isFile) continue;
                if (searchType === SearchType.Directory && !isDir) continue;
                if (nameRegex && !nameRegex.test(entry.dirent.name)) continue;

                if (isDir) {
                    if (nameRegex) {
                        results.push(entry.filePath + '/');
                    }
                } else {
                    await this.processFileEntry(
                        entry,
                        contentRegex,
                        dateFilters,
                        maxSize,
                        maxChars,
                        maxResults,
                        results
                    );
                }
            }

            return this.formatSearchOutput(results, visited, walkErrors);
        } catch (e) {
            return {
                result: `Error searching: ${(e as Error).message}`,
                status: ResultStatus.Error
            };
        }
    }
}
