import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResultStatus } from '@johannes.latzel/llm-chat';
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
        const result = await tool.execute({ path: 'new_folder' });
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Created directory');
    });

    it('creates nested directories', async () => {
        const tool = new CreateFolderTool(ws);
        const result = await tool.execute({ path: 'a/b/c' });
        expect(result.status).toBe(ResultStatus.Success);
    });

    it('reports missing path', async () => {
        const tool = new CreateFolderTool(ws);
        const result = await tool.execute({});
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('rejects path outside workspace', async () => {
        const tool = new CreateFolderTool(ws);
        const result = await tool.execute({ path: '/etc/outside' });
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
        const result = await tool.execute({ path: path.join(tmpDir, 'newdir') });
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
        const result = await tool.execute({ path: 'newdir' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('mkdir failed');
    });
});
