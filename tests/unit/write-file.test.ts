import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResultStatus, type ToolResult } from '@johannes.latzel/llm-chat';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { WriteFileTool } from '../../src/index.js';
import { FileConfiguration } from '../../src/lib/config.js';
import { FilePool } from '../../src/lib/file-pool.js';
import { AccessType, DirectoryConfiguration, Workspace } from '@johannes.latzel/llm-chat-workspace';
import { createTempDir, removeTempDir } from '../index.js';

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
    };
});

describe('WriteFileTool', () => {
    let tmpDir: string;
    let ws: Workspace;
    let fc: FileConfiguration | undefined;
    let tool: WriteFileTool;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        fc = undefined;
        tool = new WriteFileTool(ws, fc);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        removeTempDir(tmpDir);
    });

    it('writes content to a file', async () => {
        const [result] = await tool.execute({ path: 'test.txt', content: 'Hello' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Written');
    });

    it('reports missing path', async () => {
        const [result] = await tool.execute({ content: 'Hello' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('path');
    });

    it('reports missing content', async () => {
        const [result] = await tool.execute({ path: 'test.txt' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('content');
    });

    it('rejects non-string content', async () => {
        const [result] = await tool.execute({ path: 'test.txt', content: 42 }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('rejects path outside workspace', async () => {
        const [result] = await tool.execute({ path: '/etc/passwd', content: 'x' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('creates parent directories automatically', async () => {
        const [result] = await tool.execute({ path: 'sub/deep/file.txt', content: 'nested' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
    });
});

describe('WriteFileTool - additional branches', () => {
    let tmpDir: string;
    let ws: Workspace;
    let fc: FileConfiguration | undefined;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        fc = new FileConfiguration(10);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        removeTempDir(tmpDir);
    });

    it('rejects content exceeding maxCharsPerFile', async () => {
        const tool = new WriteFileTool(ws, fc);
        const [result] = await tool.execute({ path: 'long.txt', content: 'x'.repeat(11) }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('max length');
        expect(result.result).toMatch(/Content argument is 11 chars, exceeds max length of 10/);
    });

});

describe('WriteFileTool - no config', () => {
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

    it('writes a file with absolute path using default config', async () => {
        const tool = new WriteFileTool(ws);
        const [result] = await tool.execute({
            path: path.join(tmpDir, 'no-cfg.txt'),
            content: 'works'
        }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Written');
    });
});

describe('filesystem, WriteFileTool catch', () => {
    let tmpDir: string;
    let ws: Workspace;
    let fc: FileConfiguration | undefined;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        fc = undefined;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        removeTempDir(tmpDir);
    });

    it('handles writeFile failure', async () => {
        vi.mocked(fsp.writeFile).mockRejectedValueOnce(new Error('write failed'));
        const tool = new WriteFileTool(ws, fc);
        const [result] = await tool.execute({ path: 'test.txt', content: 'data' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('write failed');
    });
});

describe('WriteFileTool - requireReadBeforeWrite', () => {
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

    it('allows writing a file again after it was deleted', async () => {
        const fc = new FileConfiguration(undefined, undefined, true);
        const fp = new FilePool(fc);
        const tool = new WriteFileTool(ws, fc, fp);
        const filePath = tmpDir + '/recreate.txt';
        const first = await tool.execute({ path: filePath, content: 'first' }) as [ToolResult];
        expect(first[0].status).toBe(ResultStatus.Success);
        await fsp.rm(filePath);
        const second = await tool.execute({ path: filePath, content: 'second' }) as [ToolResult];
        expect(second[0].status).toBe(ResultStatus.Success);
        expect(second[0].result).toContain('Written');
    });

    it('rejects overwriting existing file without prior read', async () => {
        const fc = new FileConfiguration(undefined, undefined, true);
        const fp = new FilePool(fc);
        const tool = new WriteFileTool(ws, fc, fp);
        await fsp.writeFile(tmpDir + '/existing.txt', 'original', 'utf-8');
        const [result] = await tool.execute({ path: tmpDir + '/existing.txt', content: 'overwritten' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('must be read');
    });

    it('allows writing new file without prior read', async () => {
        const fc = new FileConfiguration(undefined, undefined, true);
        const fp = new FilePool(fc);
        const tool = new WriteFileTool(ws, fc, fp);
        const [result] = await tool.execute({ path: tmpDir + '/new.txt', content: 'fresh' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
    });

    it('accepts overwrite after prior read', async () => {
        const fc = new FileConfiguration(undefined, undefined, true);
        const fp = new FilePool(fc);
        const tool = new WriteFileTool(ws, fc, fp);
        const filePath = tmpDir + '/existing.txt';
        await fsp.writeFile(filePath, 'original', 'utf-8');
        await fp.recordRead(filePath);
        const [result] = await tool.execute({ path: filePath, content: 'overwritten' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
    });
});
