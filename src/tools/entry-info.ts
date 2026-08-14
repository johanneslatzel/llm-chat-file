import {
    PartialToolResult,
    PropertyType,
    ResultBuilder,
    ResultStatus,
    Tool,
    ToolParameterProperty,
    ToolParameters
} from '@johannes.latzel/llm-chat';
import * as fsp from 'node:fs/promises';
import * as fs from 'node:fs';
import type { Stats } from 'node:fs';
import type { Workspace } from '@johannes.latzel/llm-chat-workspace';

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

/** Tool that returns metadata about one or more filesystem entries. */
export class EntryInfoTool extends Tool {
    private ws: Workspace;

    /**
     * @param workspace - The workspace for path resolution and access checks.
     */
    constructor(workspace: Workspace) {
        super(
            'entry_info',
            'Returns metadata about one or more filesystem entries (files, directories, symlinks, etc.) including type, size, timestamps, permissions, and symlink target if applicable. Paths can be absolute or relative to workspace root.',
            new ToolParameters(
                {
                    paths: new ToolParameterProperty(
                        'Array of paths to get info for (absolute, or relative to workspace root)',
                        PropertyType.Array
                    )
                },
                ['paths']
            )
        );
        this.ws = workspace;
    }

    protected async onExecute(args: Record<string, unknown>): Promise<PartialToolResult> {
        const rawPaths = args.paths;
        if (!Array.isArray(rawPaths)) {
            return { result: '"paths" must be an array of strings', status: ResultStatus.Error };
        }
        if (rawPaths.length === 0) {
            return { result: '"paths" must be a non-empty array', status: ResultStatus.Error };
        }

        return await ResultBuilder.resolveAll(rawPaths.map((p) => this.infoSingle(p)));
    }

    private async infoSingle(raw: unknown): Promise<PartialToolResult> {
        if (typeof raw !== 'string' || !raw.trim()) {
            return { result: 'Path must be a non-empty string', status: ResultStatus.Error };
        }
        const resolved = this.ws.normalize(raw.trim());
        if (!this.ws.canRead(resolved)) {
            return {
                result: `Invalid or inaccessible path${this.ws.pathHint(raw, resolved)}`,
                status: ResultStatus.Error
            };
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
