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

/** Tool that searches for files and directories by name pattern, content pattern, and/or timestamps within the allowed workspace directories. */
export class SearchEntriesTool extends Tool {
    private ws: Workspace;
    private sc: SearchConfiguration;
    private fc: FileConfiguration;

    /**
     * @param workspace - Workspace instance for path resolution and access checks.
     * @param searchConfig - Optional search configuration (limits, timeout).
     * @param fileConfig - Optional file configuration (max chars, max file size).
     */
    constructor(
        workspace: Workspace,
        searchConfig?: SearchConfiguration,
        fileConfig?: FileConfiguration
    ) {
        super(
            'search_entries',
            'Searches for files and directories by name and/or content pattern. If no pattern is given, returns all entries. File content matches show the matching line; file name matches show the path; directories are suffixed with "/".',
            new ToolParameters(
                {
                    path: new ToolParameterProperty(
                        'Directory to search in (default: workspace root)'
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

    protected async onExecute(args: Record<string, unknown>): Promise<PartialToolResult> {
        const namePatternRaw = args.name_pattern;
        const contentPatternRaw = args.content_pattern;

        const hasName = typeof namePatternRaw === 'string' && namePatternRaw.trim().length > 0;
        const hasContent =
            typeof contentPatternRaw === 'string' && contentPatternRaw.trim().length > 0;

        let nameRegex: RegExp | undefined;
        if (hasName) {
            try {
                nameRegex = new RegExp(namePatternRaw.trim(), 'iu');
            } catch (e) {
                return {
                    result: `Invalid name_pattern regex: ${(e as Error).message}`,
                    status: ResultStatus.Error
                };
            }
        }

        let contentRegex: RegExp | undefined;
        if (hasContent) {
            try {
                contentRegex = new RegExp(contentPatternRaw.trim(), 'iu');
            } catch (e) {
                return {
                    result: `Invalid content_pattern regex: ${(e as Error).message}`,
                    status: ResultStatus.Error
                };
            }
        }

        const searchType = parseType(args.type);
        if (searchType === null) {
            return {
                result: 'Invalid type parameter. Accepted values: "file", "directory", "both".',
                status: ResultStatus.Error
            };
        }

        const raw = args.path;
        let searchDir: string;
        if (typeof raw === 'string' && raw.trim()) {
            searchDir = this.ws.normalize(raw.trim());
            if (!this.ws.canRead(searchDir)) {
                return { result: 'Invalid or inaccessible path', status: ResultStatus.Error };
            }
        } else {
            searchDir = this.ws.currentPath;
        }

        const maxResults =
            typeof args.max_results === 'number'
                ? Math.max(1, args.max_results)
                : this.sc.maxSearchResults;

        const maxSize =
            typeof args.max_size === 'number'
                ? Math.max(1, Math.min(args.max_size, this.fc.maxFileSize))
                : undefined;

        const createdAfter =
            typeof args.created_after === 'string' ? new Date(args.created_after) : undefined;
        const createdBefore =
            typeof args.created_before === 'string' ? new Date(args.created_before) : undefined;
        const modifiedAfter =
            typeof args.modified_after === 'string' ? new Date(args.modified_after) : undefined;
        const modifiedBefore =
            typeof args.modified_before === 'string' ? new Date(args.modified_before) : undefined;

        if (createdAfter && isNaN(createdAfter.getTime()))
            return { result: 'Invalid created_after date', status: ResultStatus.Error };
        if (createdBefore && isNaN(createdBefore.getTime()))
            return { result: 'Invalid created_before date', status: ResultStatus.Error };
        if (modifiedAfter && isNaN(modifiedAfter.getTime()))
            return { result: 'Invalid modified_after date', status: ResultStatus.Error };
        if (modifiedBefore && isNaN(modifiedBefore.getTime()))
            return { result: 'Invalid modified_before date', status: ResultStatus.Error };

        const hasTimestampFilter = !!(
            createdAfter ||
            createdBefore ||
            modifiedAfter ||
            modifiedBefore
        );

        const deadline = Date.now() + this.sc.timeoutMs;
        const results: string[] = [];
        let visited = 0;
        const maxChars = this.fc.maxCharsPerFile;

        const walkErrors: string[] = [];
        try {
            for await (const entry of this.ws.walk(searchDir, (dirPath, _err) => {
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
                } else if (isFile) {
                    let st: Stats | undefined;
                    const needsStat = hasTimestampFilter || (contentRegex && maxSize !== undefined);
                    if (needsStat) {
                        try {
                            st = await fsp.stat(entry.filePath);
                        } catch {
                            continue;
                        }
                    }

                    if (contentRegex && maxSize !== undefined && st && st.size > maxSize) continue;

                    if (hasTimestampFilter && st) {
                        if (createdAfter && st.birthtime.getTime() < createdAfter.getTime())
                            continue;
                        if (createdBefore && st.birthtime.getTime() > createdBefore.getTime())
                            continue;
                        if (modifiedAfter && st.mtime.getTime() < modifiedAfter.getTime()) continue;
                        if (modifiedBefore && st.mtime.getTime() > modifiedBefore.getTime())
                            continue;
                    }

                    if (contentRegex) {
                        if (await isBinary(entry.filePath)) continue;

                        try {
                            const content = await fsp.readFile(entry.filePath, 'utf-8');
                            const truncated = content.slice(0, maxChars);
                            const lines = truncated.split('\n');
                            for (let i = 0; i < lines.length; i++) {
                                if (results.length >= maxResults) break;
                                const line = lines[i];
                                if (line === undefined) continue;
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
            }

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
        } catch (e) {
            return {
                result: `Error searching: ${(e as Error).message}`,
                status: ResultStatus.Error
            };
        }
    }
}
