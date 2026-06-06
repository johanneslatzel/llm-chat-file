import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResultStatus } from '@johannes.latzel/llm-chat';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { DeleteFileTool } from '../../src/index.js';
import { Workspace } from '../../src/lib/workspace.js';
import { AccessType } from '../../src/lib/types.js';
import { DirectoryConfiguration } from '../../src/lib/config.js';
import { createTempDir, removeTempDir, createTempFile } from '../index.js';

vi.mock('node:fs/promises', async (importOriginal) => {
    const mod = await importOriginal<typeof import('node:fs/promises')>();
    return {
        ...mod,
        readFile: vi.fn(mod.readFile),
        writeFile: vi.fn(mod.writeFile),
        mkdir: vi.fn(mod.mkdir),
        stat: vi.fn(mod.stat),
        rename: vi.fn(mod.rename),
        readdir: vi.fn(mod.readdir),
        rm: vi.fn(mod.rm),
        rmdir: vi.fn(mod.rmdir),
    };
});

describe('DeleteFileTool', () => {
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

    it('deletes a file', async () => {
        createTempFile(tmpDir, 'file.txt', 'content');
        const tool = new DeleteFileTool(ws);
        const result = await tool.execute({ path: 'file.txt' });
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Deleted file');
    });

    it('deletes an empty directory', async () => {
        await fsp.mkdir(path.join(tmpDir, 'emptydir'), { recursive: true });
        const tool = new DeleteFileTool(ws);
        const result = await tool.execute({ path: 'emptydir' });
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Deleted directory');
    });

    it('deletes non-empty directory with recursive flag', async () => {
        await fsp.mkdir(path.join(tmpDir, 'subdir'), { recursive: true });
        createTempFile(tmpDir, 'subdir/file.txt', 'content');
        const tool = new DeleteFileTool(ws);
        const result = await tool.execute({ path: 'subdir', recursive: true });
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Deleted directory');
    });

    it('rejects non-empty directory without recursive flag', async () => {
        await fsp.mkdir(path.join(tmpDir, 'subdir'), { recursive: true });
        createTempFile(tmpDir, 'subdir/file.txt', 'content');
        const tool = new DeleteFileTool(ws);
        const result = await tool.execute({ path: 'subdir' });
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('reports missing path', async () => {
        const tool = new DeleteFileTool(ws);
        const result = await tool.execute({});
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('rejects path outside workspace', async () => {
        const tool = new DeleteFileTool(ws);
        const result = await tool.execute({ path: '/etc/passwd' });
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('rejects non-existent path', async () => {
        const tool = new DeleteFileTool(ws);
        const result = await tool.execute({ path: 'nonexistent.txt' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('does not exist');
    });
});

describe('DeleteFileTool - no config', () => {
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

    it('deletes a file with default config using absolute path', async () => {
        createTempFile(tmpDir, 'target.txt', 'data');
        const tool = new DeleteFileTool(ws);
        const result = await tool.execute({ path: path.join(tmpDir, 'target.txt') });
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Deleted file');
    });
});

describe('filesystem — DeleteFileTool catch', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        createTempFile(tmpDir, 'file.txt', 'content');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        removeTempDir(tmpDir);
    });

    it('handles rm failure', async () => {
        vi.mocked(fsp.rm).mockRejectedValueOnce(new Error('rm failed'));
        const tool = new DeleteFileTool(ws);
        const result = await tool.execute({ path: 'file.txt' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('rm failed');
    });

    it('handles rmdir failure', async () => {
        await fsp.mkdir(path.join(tmpDir, 'emptydir'), { recursive: true });
        vi.mocked(fsp.rmdir).mockRejectedValueOnce(new Error('rmdir failed'));
        const tool = new DeleteFileTool(ws);
        const result = await tool.execute({ path: 'emptydir' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('rmdir failed');
    });
});
