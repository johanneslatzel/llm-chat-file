import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResultStatus } from '@johannes.latzel/llm-chat';
import { writeFileSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { ReadFileTool } from '../../src/index.js';
import { FileConfiguration, DirectoryConfiguration } from '../../src/lib/config.js';
import { Workspace } from '../../src/lib/workspace.js';
import { AccessType } from '../../src/lib/types.js';
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

describe('ReadFileTool', () => {
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

    it('reads a file', async () => {
        createTempFile(tmpDir, 'hello.txt', 'Hello, world!');
        const tool = new ReadFileTool(ws, fc);
        const result = await tool.execute({ path: 'hello.txt' });
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Hello, world!');
    });

    it('reports missing path parameter', async () => {
        const tool = new ReadFileTool(ws, fc);
        const result = await tool.execute({});
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('non-empty string');
    });

    it('reports file not found', async () => {
        const tool = new ReadFileTool(ws, fc);
        const result = await tool.execute({ path: 'nonexistent.txt' });
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('reports error for outside accessible directory', async () => {
        const tool = new ReadFileTool(ws, fc);
        const result = await tool.execute({ path: '/etc/passwd' });
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('reports error for empty path', async () => {
        const tool = new ReadFileTool(ws, fc);
        const result = await tool.execute({ path: '' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('non-empty string');
    });

    it('reports error for whitespace-only path', async () => {
        const tool = new ReadFileTool(ws, fc);
        const result = await tool.execute({ path: '   ' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('non-empty string');
    });

    it('reads specific line range', async () => {
        createTempFile(tmpDir, 'lines.txt', 'line1\nline2\nline3\nline4\nline5\n');
        const tool = new ReadFileTool(ws, fc);
        const result = await tool.execute({ path: 'lines.txt', start_line: 2, end_line: 4 });
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('line2');
        expect(result.result).toContain('line3');
        expect(result.result).toContain('line4');
        expect(result.result).not.toContain('line1');
        expect(result.result).not.toContain('line5');
    });

    it('truncates content exceeding max_chars', async () => {
        createTempFile(tmpDir, 'long.txt', 'x'.repeat(200));
        const tool = new ReadFileTool(ws, fc);
        const result = await tool.execute({ path: 'long.txt', max_chars: 50 });
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('[truncated]');
        expect(result.result!.length).toBeLessThan(200);
    });
});

describe('ReadFileTool - absolute path and no config', () => {
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

    it('reads a file using absolute path with default config', async () => {
        createTempFile(tmpDir, 'abs.txt', 'absolute path content');
        const tool = new ReadFileTool(ws);
        const result = await tool.execute({ path: path.join(tmpDir, 'abs.txt') });
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('absolute path content');
    });
});

describe('ReadFileTool - edge cases', () => {
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

    it('clamps start_line 0 to 1', async () => {
        createTempFile(tmpDir, 'clamp.txt', 'line1\nline2\nline3');
        const tool = new ReadFileTool(ws, fc);
        const result = await tool.execute({ path: 'clamp.txt', start_line: 0 });
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('line1');
    });

    it('caps max_chars at maxCharsPerFile', async () => {
        const smallFc = new FileConfiguration(5);
        const smallWs = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        createTempFile(tmpDir, 'caps.txt', 'hello world this exceeds the limit');
        const tool = new ReadFileTool(smallWs, smallFc);
        const result = await tool.execute({ path: 'caps.txt', max_chars: 100 });
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('[truncated]');
    });

    it('reports error when path is a directory', async () => {
        const tool = new ReadFileTool(ws, fc);
        const result = await tool.execute({ path: '.' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('not a file');
    });

    it('reports error for binary file', async () => {
        const binPath = path.join(tmpDir, 'binary.bin');
        writeFileSync(binPath, Buffer.from([0x00, 0x01, 0x02, 0xFF]));
        const tool = new ReadFileTool(ws, fc);
        const result = await tool.execute({ path: 'binary.bin' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('binary');
    });
});

describe('filesystem — ReadFileTool catch', () => {
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

    it('handles readFile failure after isBinary passes', async () => {
        createTempFile(tmpDir, 'target.txt', 'hello world');
        vi.mocked(fsp.readFile).mockRejectedValueOnce(new Error('disk error'));
        const tool = new ReadFileTool(ws, fc);
        const result = await tool.execute({ path: 'target.txt' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('disk error');
    });

    it('rejects files exceeding maxFileSize', async () => {
        createTempFile(tmpDir, 'big.txt', 'x'.repeat(100));
        const fc = new FileConfiguration(10000, 50);
        const tool = new ReadFileTool(ws, fc);
        const result = await tool.execute({ path: 'big.txt' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('too large');
    });

    it('reads files within maxFileSize', async () => {
        createTempFile(tmpDir, 'small.txt', 'small content');
        const fc = new FileConfiguration(10000, 50);
        const tool = new ReadFileTool(ws, fc);
        const result = await tool.execute({ path: 'small.txt' });
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('small content');
    });

    it('clamps negative max_chars to 1', async () => {
        createTempFile(tmpDir, 'neg.txt', 'line1\nline2\nline3');
        const tool = new ReadFileTool(ws, fc);
        const result = await tool.execute({ path: 'neg.txt', max_chars: -5 });
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('[truncated]');
        // With max_chars clamped to 1, only the first character is returned
        expect(result.result).not.toContain('line1');
    });

    it('treats negative end_line as no limit', async () => {
        createTempFile(tmpDir, 'neg-end.txt', 'line1\nline2\nline3');
        const tool = new ReadFileTool(ws, fc);
        const result = await tool.execute({ path: 'neg-end.txt', end_line: -1 });
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('line3');
    });
});
