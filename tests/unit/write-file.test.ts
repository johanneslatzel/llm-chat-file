import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResultStatus } from '@johannes.latzel/llm-chat';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { WriteFileTool } from '../../src/index.js';
import { FileConfiguration, DirectoryConfiguration } from '../../src/lib/config.js';
import { Workspace } from '../../src/lib/workspace.js';
import { AccessType } from '../../src/lib/types.js';
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
        const result = await tool.execute({ path: 'test.txt', content: 'Hello' });
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Written');
    });

    it('reports missing path', async () => {
        const result = await tool.execute({ content: 'Hello' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('path');
    });

    it('reports missing content', async () => {
        const result = await tool.execute({ path: 'test.txt' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('content');
    });

    it('rejects non-string content', async () => {
        const result = await tool.execute({ path: 'test.txt', content: 42 });
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('rejects path outside workspace', async () => {
        const result = await tool.execute({ path: '/etc/passwd', content: 'x' });
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('creates parent directories automatically', async () => {
        const result = await tool.execute({ path: 'sub/deep/file.txt', content: 'nested' });
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
        const result = await tool.execute({ path: 'long.txt', content: 'x'.repeat(11) });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('max length');
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
        const result = await tool.execute({
            path: path.join(tmpDir, 'no-cfg.txt'),
            content: 'works'
        });
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Written');
    });
});

describe('filesystem — WriteFileTool catch', () => {
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
        const result = await tool.execute({ path: 'test.txt', content: 'data' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('write failed');
    });
});
