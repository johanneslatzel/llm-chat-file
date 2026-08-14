import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResultStatus, type ToolResult } from '@johannes.latzel/llm-chat';
import type { Stats } from 'node:fs';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { EntryInfoTool } from '../../src/index.js';
import { AccessType, DirectoryConfiguration, Workspace } from '@johannes.latzel/llm-chat-workspace';
import { createTempDir, removeTempDir } from '../index.js';

vi.mock('node:fs/promises', async (importOriginal) => {
    const mod = await importOriginal<typeof import('node:fs/promises')>();
    return {
        ...mod,
        lstat: vi.fn(mod.lstat),
        readlink: vi.fn(mod.readlink),
    };
});

function makeStats(overrides: Partial<Stats>): Stats {
    const defaults = {
        isFile: () => false,
        isDirectory: () => false,
        isSymbolicLink: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        isCharacterDevice: () => false,
        isBlockDevice: () => false,
        mode: 0o644,
        size: 0,
        birthtime: new Date('2025-01-01T00:00:00.000Z'),
        mtime: new Date('2025-01-01T00:00:00.000Z'),
        atime: new Date('2025-01-01T00:00:00.000Z'),
        ctime: new Date('2025-01-01T00:00:00.000Z'),
    };
    return { ...defaults, ...overrides } as Stats;
}

describe('EntryInfoTool', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        removeTempDir(tmpDir);
    });

    it('returns metadata for a file', async () => {
        await fsp.writeFile(path.join(tmpDir, 'test.txt'), 'hello');

        const tool = new EntryInfoTool(ws);
        const [result] = await tool.execute({ paths: ['test.txt'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Type: file');
        expect(result.result).toContain('Size: 5 bytes');
        expect(result.result).toContain('Permissions:');
    });

    it('returns metadata for a directory', async () => {
        await fsp.mkdir(path.join(tmpDir, 'subdir'), { recursive: true });

        const tool = new EntryInfoTool(ws);
        const [result] = await tool.execute({ paths: ['subdir'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Type: directory');
    });

    it('reports symlink target', async () => {
        await fsp.writeFile(path.join(tmpDir, 'target.txt'), 'hello');
        await fsp.symlink('target.txt', path.join(tmpDir, 'link.txt'));

        const tool = new EntryInfoTool(ws);
        const [result] = await tool.execute({ paths: ['link.txt'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Type: symlink');
        expect(result.result).toContain('Symlink target: target.txt');
    });

    it('reports missing path', async () => {
        vi.mocked(fsp.lstat).mockRejectedValueOnce(new Error('ENOENT'));
        const tool = new EntryInfoTool(ws);
        const [result] = await tool.execute({ paths: ['nonexistent'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('Path not found');
    });

    it('rejects path outside workspace', async () => {
        const tool = new EntryInfoTool(ws);
        const [result] = await tool.execute({ paths: ['/etc/outside'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('rejects empty path', async () => {
        const tool = new EntryInfoTool(ws);
        const [result] = await tool.execute({ paths: [''] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('rejects whitespace-only path', async () => {
        const tool = new EntryInfoTool(ws);
        const [result] = await tool.execute({ paths: ['   '] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('detects FIFO entry type', async () => {
        vi.mocked(fsp.lstat).mockResolvedValue(makeStats({ isFIFO: () => true }));
        const tool = new EntryInfoTool(ws);
        const [result] = await tool.execute({ paths: ['test'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Type: FIFO');
    });

    it('detects socket entry type', async () => {
        vi.mocked(fsp.lstat).mockResolvedValue(makeStats({ isSocket: () => true }));
        const tool = new EntryInfoTool(ws);
        const [result] = await tool.execute({ paths: ['test'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Type: socket');
    });

    it('detects character device entry type', async () => {
        vi.mocked(fsp.lstat).mockResolvedValue(
            makeStats({ isCharacterDevice: () => true })
        );
        const tool = new EntryInfoTool(ws);
        const [result] = await tool.execute({ paths: ['test'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Type: character device');
    });

    it('detects block device entry type', async () => {
        vi.mocked(fsp.lstat).mockResolvedValue(makeStats({ isBlockDevice: () => true }));
        const tool = new EntryInfoTool(ws);
        const [result] = await tool.execute({ paths: ['test'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Type: block device');
    });

    it('detects unknown entry type', async () => {
        vi.mocked(fsp.lstat).mockResolvedValue(makeStats({}));
        const tool = new EntryInfoTool(ws);
        const [result] = await tool.execute({ paths: ['test'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Type: unknown');
    });

    it('formats permissions with all bits set', async () => {
        vi.mocked(fsp.lstat).mockResolvedValue(
            makeStats({ mode: 0o777, isFile: () => true })
        );
        const tool = new EntryInfoTool(ws);
        const [result] = await tool.execute({ paths: ['test'] }) as [ToolResult];
        expect(result.result).toContain('Permissions: rwxrwxrwx');
    });

    it('formats permissions with no bits set', async () => {
        vi.mocked(fsp.lstat).mockResolvedValue(
            makeStats({ mode: 0o000, isFile: () => true })
        );
        const tool = new EntryInfoTool(ws);
        const [result] = await tool.execute({ paths: ['test'] }) as [ToolResult];
        expect(result.result).toContain('Permissions: ---------');
    });
});

describe('EntryInfoTool - batching', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        vi.restoreAllMocks();
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        removeTempDir(tmpDir);
    });

    it('returns metadata for multiple paths', async () => {
        await fsp.writeFile(path.join(tmpDir, 'a.txt'), 'a');
        await fsp.writeFile(path.join(tmpDir, 'b.txt'), 'b');
        const tool = new EntryInfoTool(ws);
        const results = await tool.execute({ paths: ['a.txt', 'b.txt'] }) as ToolResult[];
        expect(results).toHaveLength(2);
        expect(results[0].status).toBe(ResultStatus.Success);
        expect(results[1].status).toBe(ResultStatus.Success);
    });

    it('rejects non-array paths', async () => {
        const tool = new EntryInfoTool(ws);
        const [result] = await tool.execute({ paths: 'not-array' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('must be an array');
    });

    it('rejects empty paths array', async () => {
        const tool = new EntryInfoTool(ws);
        const [result] = await tool.execute({ paths: [] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('non-empty');
    });

    it('partially fails when one path is invalid', async () => {
        await fsp.writeFile(path.join(tmpDir, 'exists.txt'), 'data');
        const tool = new EntryInfoTool(ws);
        const results = await tool.execute({ paths: ['exists.txt', '/etc/outside', '/nonexistent-absolute'] }) as ToolResult[];
        expect(results).toHaveLength(3);
        expect(results[0].status).toBe(ResultStatus.Success);
        expect(results[1].status).toBe(ResultStatus.Error);
        expect(results[2].status).toBe(ResultStatus.Error);
    });
});

describe('EntryInfoTool - error handling', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        removeTempDir(tmpDir);
    });

    it('handles lstat failure', async () => {
        vi.mocked(fsp.lstat).mockRejectedValueOnce(new Error('lstat failed'));
        const tool = new EntryInfoTool(ws);
        const [result] = await tool.execute({ paths: ['test.txt'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('lstat failed');
    });

    it('handles unreadable symlink target', async () => {
        const stats = makeStats({ isSymbolicLink: () => true, size: 42 });
        vi.mocked(fsp.lstat).mockResolvedValue(stats);
        vi.mocked(fsp.readlink).mockRejectedValueOnce(new Error('permission denied'));
        const tool = new EntryInfoTool(ws);
        const [result] = await tool.execute({ paths: ['test'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Type: symlink');
        expect(result.result).toContain('Symlink target: (unreadable)');
    });
});
