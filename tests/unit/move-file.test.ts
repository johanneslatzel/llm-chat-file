import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResultStatus } from '@johannes.latzel/llm-chat';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { MoveFileTool } from '../../src/index.js';
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
    };
});

describe('MoveFileTool', () => {
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

    it('moves a file', async () => {
        createTempFile(tmpDir, 'source.txt', 'content');
        const tool = new MoveFileTool(ws);
        const result = await tool.execute({ source: 'source.txt', destination: 'dest.txt' });
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Moved');
    });

    it('reports missing source', async () => {
        const tool = new MoveFileTool(ws);
        const result = await tool.execute({ destination: 'dest.txt' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('source');
    });

    it('reports missing destination', async () => {
        const tool = new MoveFileTool(ws);
        const result = await tool.execute({ source: 'source.txt' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('destination');
    });

    it('rejects source outside workspace', async () => {
        const tool = new MoveFileTool(ws);
        const result = await tool.execute({ source: '/etc/passwd', destination: 'out.txt' });
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('reports source not found', async () => {
        const tool = new MoveFileTool(ws);
        const result = await tool.execute({ source: 'nonexistent.txt', destination: 'dest.txt' });
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('reports error for destination outside workspace', async () => {
        createTempFile(tmpDir, 'src.txt', 'content');
        const tool = new MoveFileTool(ws);
        const result = await tool.execute({ source: 'src.txt', destination: '../outside.txt' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('destination');
    });
});

describe('MoveFileTool - no config', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        createTempFile(tmpDir, 'move-src.txt', 'data');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        removeTempDir(tmpDir);
    });

    it('moves a file with default config using absolute paths', async () => {
        const tool = new MoveFileTool(ws);
        const result = await tool.execute({
            source: path.join(tmpDir, 'move-src.txt'),
            destination: path.join(tmpDir, 'move-dst.txt')
        });
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Moved');
    });
});

describe('filesystem — MoveFileTool source not file/dir', () => {
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

    it('rejects source that is neither file nor directory', async () => {
        const { execSync } = require('node:child_process');
        execSync(`mkfifo "${path.join(tmpDir, 'mypipe')}"`, { stdio: 'ignore' });
        const tool = new MoveFileTool(ws);
        const result = await tool.execute({ source: 'mypipe', destination: 'dest' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('not a file or directory');
    });
});

describe('filesystem — MoveFileTool catch', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        createTempFile(tmpDir, 'src.txt', 'data');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        removeTempDir(tmpDir);
    });

    it('handles rename failure', async () => {
        vi.mocked(fsp.rename).mockRejectedValueOnce(new Error('rename failed'));
        const tool = new MoveFileTool(ws);
        const result = await tool.execute({ source: 'src.txt', destination: 'dst.txt' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('rename failed');
    });
});
