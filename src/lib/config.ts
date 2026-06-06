import * as path from 'node:path';
import { AccessType } from './types.js';

/** Configuration for file search operations (content search, name search, timestamp search, etc.). */
export class SearchConfiguration {
    /**
     * Maximum number of search results to return.
     * Falls back to the `LLM_CHAT_FS_MAX_SEARCH_RESULTS` environment variable, or `50` if not set.
     */
    maxSearchResults: number;

    /**
     * Threshold above which results are returned as a count summary instead of individual paths.
     * Falls back to `LLM_CHAT_FS_MAX_DISPLAY_ENTRIES` or `200`.
     */
    maxDisplayEntries: number;

    /**
     * Hard limit on total entries to traverse. Returns an error if exceeded.
     * Falls back to `LLM_CHAT_FS_MAX_TOTAL_ENTRIES` or `5000`.
     */
    maxTotalEntries: number;

    /**
     * Total search timeout in milliseconds. The search returns partial results if this is exceeded.
     * Falls back to `LLM_CHAT_FS_SEARCH_TIMEOUT` or `10000`.
     */
    timeoutMs: number;

    /**
     * @param maxSearchResults - Maximum results. Defaults to env `LLM_CHAT_FS_MAX_SEARCH_RESULTS` or `50`.
     * @param maxDisplayEntries - Display threshold. Defaults to env `LLM_CHAT_FS_MAX_DISPLAY_ENTRIES` or `200`.
     * @param maxTotalEntries - Hard traversal limit. Defaults to env `LLM_CHAT_FS_MAX_TOTAL_ENTRIES` or `5000`.
     * @param timeoutMs - Total search timeout. Defaults to env `LLM_CHAT_FS_SEARCH_TIMEOUT` or `10000`.
     */
    constructor(
        maxSearchResults?: number,
        maxDisplayEntries?: number,
        maxTotalEntries?: number,
        timeoutMs?: number
    ) {
        this.maxSearchResults =
            maxSearchResults ?? parseEnvInt('LLM_CHAT_FS_MAX_SEARCH_RESULTS', 50);
        this.maxDisplayEntries =
            maxDisplayEntries ?? parseEnvInt('LLM_CHAT_FS_MAX_DISPLAY_ENTRIES', 200);
        this.maxTotalEntries =
            maxTotalEntries ?? parseEnvInt('LLM_CHAT_FS_MAX_TOTAL_ENTRIES', 5000);
        this.timeoutMs = timeoutMs ?? parseEnvInt('LLM_CHAT_FS_SEARCH_TIMEOUT', 10000);
    }
}

/** Configuration that defines which directories are accessible and at what permission level. */
export class DirectoryConfiguration {
    /** List of access entries. Must contain at least one entry. */
    accesses: { type: AccessType; path: string }[];

    /** Directory names to skip when walking directory trees (e.g. `node_modules`, `.git`). */
    skipDirs: string[];

    /**
     * When `true`, resolves symlinks via `fs.realpathSync.native()` before access checks.
     * This prevents symlink-based path traversal outside configured directories.
     * Defaults to `false` (symlinks are followed as-is).
     */
    resolveSymlinks: boolean;

    /** The default workspace path. Used as the initial `currentPath` in the Workspace. */
    workspacePath?: string | undefined;

    /**
     * Constructs a directory configuration. When called with no arguments,
     * all values are read from environment variables. Pass specific arguments
     * to override individual values.
     *
     * @param accesses - Access entries. Omit or pass `undefined` to read from env vars.
     * @param skipDirs - Directory names to skip. Defaults to `[]` when accesses are explicitly provided.
     * @param resolveSymlinks - Resolve symlinks before access checks. Defaults to `false` when accesses are explicitly provided.
     * @param workspacePath - Default workspace path. Defaults to resolved `LLM_CHAT_FS_WORKSPACE` or `cwd` when reading from env.
     */
    constructor(
        accesses?: { type: AccessType; path: string }[],
        skipDirs?: string[],
        resolveSymlinks?: boolean,
        workspacePath?: string
    ) {
        if (accesses) {
            this.accesses = accesses;
            this.skipDirs = skipDirs ?? [];
            this.resolveSymlinks = resolveSymlinks ?? false;
            this.workspacePath = workspacePath;
        } else {
            const readDirs = parseDirs(process.env.LLM_CHAT_FS_READ_DIRS);
            const writeDirs = parseDirs(process.env.LLM_CHAT_FS_WRITE_DIRS);
            this.accesses = [];
            for (const d of readDirs) {
                this.accesses.push({ type: AccessType.Read, path: path.resolve(d) });
            }
            for (const d of writeDirs) {
                this.accesses.push({ type: AccessType.Write, path: path.resolve(d) });
            }
            const wsPath = path.resolve(process.env.LLM_CHAT_FS_WORKSPACE ?? process.cwd());
            const alreadyWrite = this.accesses.some(
                (a) => a.type === AccessType.Write && a.path === wsPath
            );
            if (!alreadyWrite) {
                this.accesses.push({ type: AccessType.Write, path: wsPath });
            }
            this.skipDirs = parseDirs(process.env.LLM_CHAT_FS_SKIP_DIRS);
            this.resolveSymlinks = parseEnvBool('LLM_CHAT_FS_RESOLVE_SYMLINKS', false);
            this.workspacePath = wsPath;
        }
    }

    /**
     * Deduplicates directory accesses: for any path that appears multiple times,
     * write access takes precedence over read access. Exact duplicates are removed.
     *
     * @returns A new directory configuration with deduplicated accesses.
     */
    deduplicate(): DirectoryConfiguration {
        const seen = new Map<string, AccessType>();
        for (const a of this.accesses) {
            const existing = seen.get(a.path);
            if (existing === AccessType.Write) continue;
            if (a.type === AccessType.Write || !existing) {
                seen.set(a.path, a.type);
            }
        }
        return new DirectoryConfiguration(
            Array.from(seen.entries()).map(([path, type]) => ({ type, path })),
            this.skipDirs,
            this.resolveSymlinks,
            this.workspacePath
        );
    }
}

/** Configuration for file read/write operations (character limits, etc.). */
export class FileConfiguration {
    /**
     * Maximum number of characters allowed per file read or write.
     * Falls back to the `LLM_CHAT_FS_MAX_CHARS_PER_FILE` environment variable, or `10000` if not set.
     */
    maxCharsPerFile: number;

    /**
     * Maximum file size in bytes allowed for read operations.
     * Falls back to the `LLM_CHAT_FS_MAX_FILE_SIZE` environment variable, or `10485760` (10 MB) if not set.
     */
    maxFileSize: number;

    /**
     * @param maxCharsPerFile - Maximum chars. Defaults to env `LLM_CHAT_FS_MAX_CHARS_PER_FILE` or `10000`.
     * @param maxFileSize - Maximum file size in bytes. Defaults to env `LLM_CHAT_FS_MAX_FILE_SIZE` or `10485760` (10 MB).
     */
    constructor(maxCharsPerFile?: number, maxFileSize?: number) {
        this.maxCharsPerFile =
            maxCharsPerFile ?? parseEnvInt('LLM_CHAT_FS_MAX_CHARS_PER_FILE', 10000);
        this.maxFileSize =
            maxFileSize ?? parseEnvInt('LLM_CHAT_FS_MAX_FILE_SIZE', 10 * 1024 * 1024);
    }
}

function parseEnvInt(key: string, fallback: number, min = 1): number {
    const raw = process.env[key];
    if (raw === undefined || raw === '') return Math.max(min, fallback);
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? Math.max(min, fallback) : Math.max(min, parsed);
}

function parseDirs(raw: string | undefined): string[] {
    if (!raw) return [];
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function parseEnvBool(key: string, fallback: boolean): boolean {
    const raw = process.env[key];
    if (raw === undefined || raw === '') return fallback;
    return raw === 'true';
}
