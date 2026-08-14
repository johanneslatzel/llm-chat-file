import { Mutex } from 'async-mutex';
import { ResultStatus, type PartialToolResult } from '@johannes.latzel/llm-chat';
import * as fsp from 'node:fs/promises';
import { FileConfiguration } from './config.js';

/**
 * Tracks file reads and writes to enforce a "require read before write" policy.
 *
 * When enabled via {@link FileConfiguration.requireReadBeforeWrite}, files must be
 * read before they can be modified. A write also counts as a read, so the sequence
 * read -> write -> write is allowed. This ensures the tool knows the current file
 * content before applying edits.
 */
export class FilePool {
    private mutex = new Mutex();
    private _timestamps = new Map<string, number>();
    private fc: FileConfiguration;

    /**
     * @param fileConfig - Configuration that controls whether the read-before-write
     *   check is enabled.
     */
    constructor(fileConfig: FileConfiguration) {
        this.fc = fileConfig;
    }

    /**
     * Records that a file was read at the current time.
     * This timestamp is later checked by {@link verifyWrite} to detect concurrent
     * modifications.
     *
     * @param resolved - The resolved absolute path to the file.
     */
    async recordRead(resolved: string): Promise<void> {
        if (!this.fc.requireReadBeforeWrite) return;
        await this.mutex.runExclusive(() => {
            // +1 provides a 1ms buffer so that filesystem mtime (which may have
            // sub-ms precision) does not trigger a false "changed since last read"
            // when the read and a subsequent write fall within the same clock tick.
            this._timestamps.set(resolved, Date.now() + 1);
        });
    }

    /**
     * Verifies that a file is safe to write: it must have been read after the last
     * on-disk modification, or (if {@link allowNew} is true) must not exist yet.
     *
     * @param resolved - The resolved absolute path to the file.
     * @param allowNew - When true, allows writing to a path that has no read
     *   timestamp as long as the path does not currently exist.
     * @returns An error {@link PartialToolResult} if the write should be blocked,
     *   or `null` if the write is allowed.
     */
    async verifyWrite(resolved: string, allowNew = false): Promise<PartialToolResult | null> {
        if (!this.fc.requireReadBeforeWrite) return null;
        return this.mutex.runExclusive(async () => {
            const lastRead = this._timestamps.get(resolved);
            if (lastRead === undefined) {
                if (allowNew) {
                    try {
                        await fsp.stat(resolved);
                    } catch {
                        return null;
                    }
                }
                return {
                    result: `File must be read before writing: ${resolved}`,
                    status: ResultStatus.Error
                };
            }
            try {
                const st = await fsp.stat(resolved);
                if (st.mtime.getTime() > lastRead) {
                    return {
                        result: `File has changed since last read: ${resolved}`,
                        status: ResultStatus.Error
                    };
                }
            } catch {
                // The file no longer exists (e.g. it was deleted after a prior
                // read or write). Writing recreates it fresh, so there is no
                // on-disk content the read-before-write policy must protect.
                // Returning an error here would deadlock: the missing file cannot
                // be read, making write -> delete -> write impossible.
                return null;
            }
            return null;
        });
    }

    /**
     * Records that a file was written at the current time.
     * A write also counts as a read, so subsequent writes are allowed without
     * an intervening read_file call.
     *
     * @param resolved - The resolved absolute path to the file.
     */
    async recordWrite(resolved: string): Promise<void> {
        if (!this.fc.requireReadBeforeWrite) return;
        await this.mutex.runExclusive(() => {
            // Same +1 buffer as recordRead, ensures a write that lands in the same
            // millisecond as verifyWrite's mtime check isn't mistaken for external
            // modification.
            this._timestamps.set(resolved, Date.now() + 1);
        });
    }
}
