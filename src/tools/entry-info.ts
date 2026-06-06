import {
    PartialToolResult,
    ResultStatus,
    Tool,
    ToolParameterProperty,
    ToolParameters
} from '@johannes.latzel/llm-chat';
import * as fsp from 'node:fs/promises';
import * as fs from 'node:fs';
import type { Stats } from 'node:fs';
import type { Workspace } from '../lib/workspace.js';

/**
 * Categorises the type of a filesystem entry based on `fs.Stats`.
 * Used by `EntryInfoTool` to describe the entry in its output.
 */
enum EntryType {
    /** Regular file. */
    File = 'file',
    /** Directory. */
    Directory = 'directory',
    /** Symbolic link. */
    Symlink = 'symlink',
    /** Named pipe (FIFO). */
    FIFO = 'FIFO',
    /** Unix domain socket. */
    Socket = 'socket',
    /** Character device. */
    CharacterDevice = 'character device',
    /** Block device. */
    BlockDevice = 'block device',
    /** Any other entry type not covered above. */
    Unknown = 'unknown'
}

function formatMode(mode: number): string {
    const usr =
        (mode & fs.constants.S_IRUSR ? 'r' : '-') +
        (mode & fs.constants.S_IWUSR ? 'w' : '-') +
        (mode & fs.constants.S_IXUSR ? 'x' : '-');
    const grp =
        (mode & fs.constants.S_IRGRP ? 'r' : '-') +
        (mode & fs.constants.S_IWGRP ? 'w' : '-') +
        (mode & fs.constants.S_IXGRP ? 'x' : '-');
    const oth =
        (mode & fs.constants.S_IROTH ? 'r' : '-') +
        (mode & fs.constants.S_IWOTH ? 'w' : '-') +
        (mode & fs.constants.S_IXOTH ? 'x' : '-');
    return `${usr}${grp}${oth}`;
}

function entryType(stats: Stats): EntryType {
    if (stats.isSymbolicLink()) return EntryType.Symlink;
    if (stats.isDirectory()) return EntryType.Directory;
    if (stats.isFile()) return EntryType.File;
    if (stats.isFIFO()) return EntryType.FIFO;
    if (stats.isSocket()) return EntryType.Socket;
    if (stats.isCharacterDevice()) return EntryType.CharacterDevice;
    if (stats.isBlockDevice()) return EntryType.BlockDevice;
    return EntryType.Unknown;
}

/** Tool that returns metadata about a filesystem entry (file, directory, symlink, etc.). */
export class EntryInfoTool extends Tool {
    private ws: Workspace;

    constructor(workspace: Workspace) {
        super(
            'entry_info',
            'Returns metadata about a filesystem entry (file, directory, symlink, etc.) including its type, size, timestamps, permissions, and symlink target if applicable.',
            new ToolParameters(
                {
                    path: new ToolParameterProperty('File system path')
                },
                ['path']
            )
        );
        this.ws = workspace;
    }

    protected async onExecute(args: Record<string, unknown>): Promise<PartialToolResult> {
        const raw = args.path;
        if (typeof raw !== 'string' || !raw.trim()) {
            return { result: 'Invalid or inaccessible path', status: ResultStatus.Error };
        }
        const resolved = this.ws.normalize(raw.trim());
        if (!this.ws.canRead(resolved)) {
            return { result: 'Invalid or inaccessible path', status: ResultStatus.Error };
        }

        let stats: Stats;
        try {
            stats = await fsp.lstat(resolved);
        } catch (e) {
            return {
                result: `Path not found: ${(e as Error).message}`,
                status: ResultStatus.Error
            };
        }

        const type = entryType(stats);
        const lines: string[] = [
            `Path: ${resolved}`,
            `Type: ${type}`,
            `Size: ${stats.size} bytes`,
            `Permissions: ${formatMode(stats.mode)}`,
            `Created: ${stats.birthtime.toISOString()}`,
            `Modified (content): ${stats.mtime.toISOString()}`,
            `Accessed: ${stats.atime.toISOString()}`,
            `Changed (metadata): ${stats.ctime.toISOString()}`
        ];

        if (stats.isSymbolicLink()) {
            try {
                const target = await fsp.readlink(resolved);
                lines.push(`Symlink target: ${target}`);
            } catch {
                lines.push('Symlink target: (unreadable)');
            }
        }

        return { result: lines.join('\n'), status: ResultStatus.Success };
    }
}
