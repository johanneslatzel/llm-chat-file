import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResultStatus } from '@johannes.latzel/llm-chat';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { ReplaceFileLinesTool } from '../../src/index.js';
import { FileConfiguration } from '../../src/lib/config.js';
import { FilePool } from '../../src/lib/file-pool.js';
import { AccessType, DirectoryConfiguration, Workspace } from '@johannes.latzel/llm-chat-workspace';
import { createTempDir, removeTempDir, createTempFile } from '../index.js';

vi.mock('node:fs/promises', async (importOriginal) => {
    const mod = await importOriginal<typeof import('node:fs/promises')>();
    return {
        ...mod,
        readFile: vi.fn(mod.readFile),
        writeFile: vi.fn(mod.writeFile),
        mkdir: vi.fn(mod.mkdir),
        stat: vi.fn(mod.stat)
    };
});

describe('ReplaceFileLinesTool', () => {
    let tmpDir: string;
    let ws: Workspace;
    let tool: ReplaceFileLinesTool;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        tool = new ReplaceFileLinesTool(ws, new FileConfiguration(undefined, undefined, false));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        removeTempDir(tmpDir);
    });

    it('replaces a single line', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'line1\nline2\nline3\nline4\nline5');
        const result = await tool.execute({ path: filePath, content: 'replaced', start_line: 3 });
        expect(result[0].status).toBe(ResultStatus.Success);
        expect(result[0].result).toContain('Replaced');
        const content = await fsp.readFile(filePath, 'utf-8');
        expect(content).toBe('line1\nline2\nreplaced\nline4\nline5');
    });

    it('replaces multiple lines', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'line1\nline2\nline3\nline4\nline5');
        const result = await tool.execute({
            path: filePath,
            content: 'a\nb\nc',
            start_line: 2,
            end_line: 4
        });
        expect(result[0].status).toBe(ResultStatus.Success);
        const content = await fsp.readFile(filePath, 'utf-8');
        expect(content).toBe('line1\na\nb\nc\nline5');
    });

    it('deletes a range when content is empty', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'line1\nline2\nline3\nline4\nline5');
        const result = await tool.execute({
            path: filePath,
            content: '',
            start_line: 2,
            end_line: 4
        });
        expect(result[0].status).toBe(ResultStatus.Success);
        const content = await fsp.readFile(filePath, 'utf-8');
        expect(content).toBe('line1\nline5');
    });

    it('reports error when start_line exceeds file length', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb\nc');
        const result = await tool.execute({ path: filePath, content: 'x', start_line: 10 });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('exceeds file length');
    });

    it('reports error when end_line exceeds file length', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb\nc');
        const result = await tool.execute({
            path: filePath,
            content: 'x',
            start_line: 2,
            end_line: 10
        });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('exceeds file length');
    });

    it('reports error when end_line < start_line', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb\nc');
        const result = await tool.execute({
            path: filePath,
            content: 'x',
            start_line: 3,
            end_line: 1
        });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('end_line must be >= start_line');
    });

    it('reports error when start_line < 1', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb\nc');
        const result = await tool.execute({ path: filePath, content: 'x', start_line: 0 });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('start_line must be >= 1');
    });

    it('reports error when file does not exist', async () => {
        const filePath = path.join(tmpDir, 'nonexistent.txt');
        const result = await tool.execute({ path: filePath, content: 'x', start_line: 1 });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('File not found');
    });

    it('rejects path outside workspace', async () => {
        const result = await tool.execute({ path: '/etc/passwd', content: 'x', start_line: 1 });
        expect(result[0].status).toBe(ResultStatus.Error);
    });

    it('reports error for non-string content', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb\nc');
        const result = await tool.execute({ path: filePath, content: 42, start_line: 1 });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('content must be a string');
    });

    it('reports error for non-numeric start_line', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb\nc');
        const result = await tool.execute({ path: filePath, content: 'x', start_line: 'abc' });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('start_line must be a number');
    });

    it('reports error when path is a directory', async () => {
        const result = await tool.execute({ path: tmpDir, content: 'x', start_line: 1 });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('not a file');
    });

    it('reports error when file exceeds maxFileSize', async () => {
        const fc = new FileConfiguration(100, 5, false);
        const localTool = new ReplaceFileLinesTool(ws, fc);
        const filePath = createTempFile(tmpDir, 'test.txt', 'this file is too large');
        const result = await localTool.execute({ path: filePath, content: 'x', start_line: 1 });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('max');
    });

    it('reports error when content exceeds maxCharsPerFile', async () => {
        const fc = new FileConfiguration(5, undefined, false);
        const localTool = new ReplaceFileLinesTool(ws, fc);
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb\nc');
        const result = await localTool.execute({
            path: filePath,
            content: 'too long content',
            start_line: 1
        });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('max length');
        expect(result[0].result).toMatch(/Resulting file would be \d+ chars, exceeds max length of 5/);
    });

    it('reports error for binary file', async () => {
        const filePath = createTempFile(tmpDir, 'test.bin', '\x00\x01\x02');
        const result = await tool.execute({ path: filePath, content: 'x', start_line: 1 });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('binary');
    });

    it('handles writeFile failure', async () => {
        vi.mocked(fsp.writeFile).mockRejectedValueOnce(new Error('write failed'));
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb\nc');
        const result = await tool.execute({ path: filePath, content: 'x', start_line: 1 });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('write failed');
    });

    it('uses default end_line equal to start_line', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'keep\nreplace\nkeep');
        const result = await tool.execute({ path: filePath, content: 'new', start_line: 2 });
        expect(result[0].status).toBe(ResultStatus.Success);
        const content = await fsp.readFile(filePath, 'utf-8');
        expect(content).toBe('keep\nnew\nkeep');
    });

    it('replaces first line', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'first\nsecond\nthird');
        const result = await tool.execute({ path: filePath, content: 'changed', start_line: 1 });
        expect(result[0].status).toBe(ResultStatus.Success);
        const content = await fsp.readFile(filePath, 'utf-8');
        expect(content).toBe('changed\nsecond\nthird');
    });

    it('replaces last line', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'first\nsecond\nthird');
        const result = await tool.execute({ path: filePath, content: 'changed', start_line: 3 });
        expect(result[0].status).toBe(ResultStatus.Success);
        const content = await fsp.readFile(filePath, 'utf-8');
        expect(content).toBe('first\nsecond\nchanged');
    });
});

describe('ReplaceFileLinesTool - without fileConfig', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
    });

    afterEach(() => {
        removeTempDir(tmpDir);
    });

    it('constructs and works with default config', async () => {
        const localTool = new ReplaceFileLinesTool(ws);
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb\nc');
        const result = await localTool.execute({ path: filePath, content: 'x', start_line: 2 });
        expect(result[0].status).toBe(ResultStatus.Success);
    });
});

describe('ReplaceFileLinesTool - requireReadBeforeWrite', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
    });

    afterEach(() => {
        removeTempDir(tmpDir);
    });

    it('rejects write when file was not read', async () => {
        const fc = new FileConfiguration(undefined, undefined, true);
        const fp = new FilePool(fc);
        const localTool = new ReplaceFileLinesTool(ws, fc, fp);
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb\nc');
        const result = await localTool.execute({ path: filePath, content: 'x', start_line: 2 });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('must be read');
    });

    it('accepts write after read', async () => {
        const fc = new FileConfiguration(undefined, undefined, true);
        const fp = new FilePool(fc);
        const localTool = new ReplaceFileLinesTool(ws, fc, fp);
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb\nc');
        await fp.recordRead(filePath);
        const result = await localTool.execute({ path: filePath, content: 'x', start_line: 2 });
        expect(result[0].status).toBe(ResultStatus.Success);
    });
});
