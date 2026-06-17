import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResultStatus, type ToolResult } from '@johannes.latzel/llm-chat';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { CreateFolderTool } from '../../src/index.js';
import { Workspace } from '../../src/lib/workspace.js';
import { AccessType } from '../../src/lib/types.js';
import { DirectoryConfiguration } from '../../src/lib/config.js';
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

describe('CreateFolderTool', () => {
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

    it('creates a directory', async () => {
        const tool = new CreateFolderTool(ws);
        const [result] = await tool.execute({ paths: ['new_folder'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Created directory');
    });

    it('creates multiple directories', async () => {
        const tool = new CreateFolderTool(ws);
        const results = await tool.execute({ paths: ['a', 'b', 'c'] }) as ToolResult[];
        expect(results).toHaveLength(3);
        expect(results[0].status).toBe(ResultStatus.Success);
        expect(results[1].status).toBe(ResultStatus.Success);
        expect(results[2].status).toBe(ResultStatus.Success);
    });

    it('creates nested directories', async () => {
        const tool = new CreateFolderTool(ws);
        const [result] = await tool.execute({ paths: ['a/b/c'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
    });

    it('reports missing paths', async () => {
        const tool = new CreateFolderTool(ws);
        const [result] = await tool.execute({}) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('rejects non-array paths', async () => {
        const tool = new CreateFolderTool(ws);
        const [result] = await tool.execute({ paths: 'not-array' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('must be an array');
    });

    it('rejects empty paths array', async () => {
        const tool = new CreateFolderTool(ws);
        const [result] = await tool.execute({ paths: [] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('non-empty');
    });

    it('rejects empty string in paths', async () => {
        const tool = new CreateFolderTool(ws);
        const [result] = await tool.execute({ paths: [''] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('non-empty string');
    });

    it('rejects non-string element in paths', async () => {
        const tool = new CreateFolderTool(ws);
        const [result] = await tool.execute({ paths: [42] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('non-empty string');
    });

    it('rejects path outside workspace', async () => {
        const tool = new CreateFolderTool(ws);
        const [result] = await tool.execute({ paths: ['/etc/outside'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
    });
});

describe('CreateFolderTool - no config', () => {
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

    it('creates a folder with default config using absolute path', async () => {
        const tool = new CreateFolderTool(ws);
        const [result] = await tool.execute({ paths: [path.join(tmpDir, 'newdir')] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Created directory');
    });
});

describe('filesystem — CreateFolderTool catch', () => {
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

    it('handles mkdir failure', async () => {
        vi.mocked(fsp.mkdir).mockRejectedValueOnce(new Error('mkdir failed'));
        const tool = new CreateFolderTool(ws);
        const [result] = await tool.execute({ paths: ['newdir'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('mkdir failed');
    });
});
