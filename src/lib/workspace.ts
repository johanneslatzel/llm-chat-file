import { Mutex } from 'async-mutex';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { DirectoryConfiguration } from './config.js';

function isWithin(resolved: string, dirs: string[]): boolean {
    const real = path.resolve(resolved);
    for (const dir of dirs) {
        const d = path.resolve(dir);
        const rel = path.relative(d, real);
        if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return true;
        if (rel === '') return true;
    }
    return false;
}

/**
 * Manages the current workspace path and enforces access control for all file operations.
 *
 * Tracks which directories are accessible (read and/or write) and provides methods
 * to check permissions, resolve paths, and switch the active workspace directory.
 * Uses a mutex to ensure thread-safe workspace switching.
 */
export class Workspace {
    /** The currently active workspace directory (absolute path). */
    currentPath: string;
    private cfg: DirectoryConfiguration;
    private mutex: Mutex;

    /**
     * @param config - Directory configuration defining accessible paths and their permission levels.
     * @throws {Error} If the configuration contains no access entries.
     */
    constructor(config: DirectoryConfiguration) {
        const cleaned = config.deduplicate();
        if (cleaned.accesses.length === 0) {
            throw new Error('At least one access directory is required');
        }
        this.cfg = cleaned;
        this.mutex = new Mutex();

        if (cleaned.workspacePath) {
            this.currentPath = path.resolve(cleaned.workspacePath);
        } else {
            const writeDir = cleaned.accesses.find((a) => a.type === 'write');
            this.currentPath = writeDir
                ? path.resolve(writeDir.path)
                : path.resolve(cleaned.accesses[0]!.path);
        }

        this.currentPath = this.resolvePath(this.currentPath);
    }

    /**
     * Changes the current workspace path to a new directory, thread-safe with a mutex.
     *
     * @param target - Path to the new workspace directory (may be relative or absolute).
     * @throws {Error} If the target is not within any configured accessible directory.
     */
    async switchWorkspace(target: string): Promise<void> {
        await this.mutex.runExclusive(async () => {
            let resolved = path.resolve(target);
            resolved = this.resolvePath(resolved);
            const allDirs = this.cfg.accesses.map((a) => path.resolve(a.path));
            if (!isWithin(resolved, allDirs)) {
                throw new Error(`Path is not within any configured directory: ${target}`);
            }
            this.currentPath = resolved;
        });
    }

    /**
     * Resolves a path against the current workspace. If the input is already absolute, `path.resolve` returns it as-is.
     *
     * @param input - Path to resolve (relative or absolute).
     * @returns The resolved absolute path.
     */
    normalize(input: string): string {
        return this.resolvePath(input);
    }

    /**
     * Checks whether the given absolute path is within any directory configured for read (or write) access.
     *
     * @param absPath - Absolute path to check.
     * @returns `true` if the path is readable.
     */
    canRead(absPath: string): boolean {
        const pathToCheck = this.resolvePath(absPath);
        const readDirs = this.cfg.accesses
            .filter((a) => a.type === 'read')
            .map((a) => path.resolve(a.path));
        const writeDirs = this.cfg.accesses
            .filter((a) => a.type === 'write')
            .map((a) => path.resolve(a.path));
        return isWithin(pathToCheck, [...readDirs, ...writeDirs]);
    }

    /**
     * Checks whether the given absolute path is within any directory configured for write access.
     *
     * @param absPath - Absolute path to check.
     * @returns `true` if the path is writable.
     */
    canWrite(absPath: string): boolean {
        const pathToCheck = this.resolvePath(absPath);
        const writeDirs = this.cfg.accesses
            .filter((a) => a.type === 'write')
            .map((a) => path.resolve(a.path));
        return isWithin(pathToCheck, writeDirs);
    }

    /**
     * Returns the list of configured directory accesses with their types.
     */
    getAccesses(): { type: 'read' | 'write'; path: string }[] {
        return this.cfg.accesses.map((a) => ({ type: a.type, path: path.resolve(a.path) }));
    }

    /**
     * Returns the list of directory names to skip when walking (e.g. `node_modules`, `.git`).
     */
    get skipDirs(): string[] {
        return this.cfg.skipDirs;
    }

    /** Whether symlink resolution is enabled for access checks. */
    get resolveSymlinks(): boolean {
        return this.cfg.resolveSymlinks;
    }

    private resolvePath(input: string): string {
        const abs = path.resolve(this.currentPath, input);
        if (!this.cfg.resolveSymlinks) return abs;
        try {
            return fs.realpathSync.native(abs);
        } catch {
            return abs;
        }
    }

    /**
     * Recursively walks a directory, yielding entries for files and directories.
     * Skips directories whose names are listed in `cfg.skipDirs`.
     *
     * @param dir - Directory to walk.
     * @param onError - Optional callback invoked when a subdirectory cannot be read.
     *   Receives the directory path and the error. The walk continues with other subtrees.
     * @yields {WalkEntry} Entries for each file and subdirectory found.
     */
    async *walk(
        dir: string,
        onError?: (dirPath: string, error: Error) => void
    ): AsyncGenerator<{ filePath: string; dirent: import('node:fs').Dirent }> {
        const resolved = this.resolvePath(dir);
        if (!this.canRead(resolved)) return;
        let entries: import('node:fs').Dirent[];
        try {
            entries = await fsp.readdir(resolved, { withFileTypes: true });
        } catch (e) {
            onError?.(resolved, e as Error);
            return;
        }
        for (const entry of entries) {
            const fullPath = path.join(resolved, entry.name);
            if (entry.isDirectory()) {
                if (this.cfg.skipDirs.includes(entry.name)) continue;
                yield { filePath: fullPath, dirent: entry };
                yield* this.walk(fullPath, onError);
            } else if (entry.isFile()) {
                yield { filePath: fullPath, dirent: entry };
            }
        }
    }
}
