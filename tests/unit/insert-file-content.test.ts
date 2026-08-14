import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResultStatus } from '@johannes.latzel/llm-chat';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { InsertFileContentTool } from '../../src/index.js';
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

describe('InsertFileContentTool', () => {
    let tmpDir: string;
    let ws: Workspace;
    let tool: InsertFileContentTool;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        tool = new InsertFileContentTool(ws, new FileConfiguration(undefined, undefined, false));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        removeTempDir(tmpDir);
    });

    it('inserts content before a specific line', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'line1\nline2\nline3');
        const result = await tool.execute({ path: filePath, content: 'inserted', line: 2 });
        expect(result[0].status).toBe(ResultStatus.Success);
        expect(result[0].result).toContain('Inserted');
        expect(result[0].result).toContain('line 2');
        expect(result[0].result).not.toMatch(/lines \d+-\d+/);
        const content = await fsp.readFile(filePath, 'utf-8');
        expect(content).toBe('line1\ninserted\nline2\nline3');
    });

    it('appends content at end of file when no line specified', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'line1\nline2');
        const result = await tool.execute({ path: filePath, content: 'appended' });
        expect(result[0].status).toBe(ResultStatus.Success);
        const content = await fsp.readFile(filePath, 'utf-8');
        expect(content).toBe('line1\nline2\nappended');
    });

    it('inserts at beginning when line is 1', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'line1\nline2');
        const result = await tool.execute({ path: filePath, content: 'prepended', line: 1 });
        expect(result[0].status).toBe(ResultStatus.Success);
        const content = await fsp.readFile(filePath, 'utf-8');
        expect(content).toBe('prepended\nline1\nline2');
    });

    it('inserts multi-line content', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'line1\nline4');
        const result = await tool.execute({ path: filePath, content: 'line2\nline3', line: 2 });
        expect(result[0].status).toBe(ResultStatus.Success);
        expect(result[0].result).toContain('lines 2-3');
        const content = await fsp.readFile(filePath, 'utf-8');
        expect(content).toBe('line1\nline2\nline3\nline4');
    });

    it('appends at end when line equals lines.length + 1', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb\nc');
        const result = await tool.execute({ path: filePath, content: 'd', line: 4 });
        expect(result[0].status).toBe(ResultStatus.Success);
        const content = await fsp.readFile(filePath, 'utf-8');
        expect(content).toBe('a\nb\nc\nd');
    });

    it('reports error when line is out of range (too small)', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb');
        const result = await tool.execute({ path: filePath, content: 'x', line: 0 });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('out of range');
    });

    it('reports error when line is out of range (too large)', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb');
        const result = await tool.execute({ path: filePath, content: 'x', line: 10 });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('out of range');
    });

    it('reports error when file does not exist', async () => {
        const filePath = path.join(tmpDir, 'nonexistent.txt');
        const result = await tool.execute({ path: filePath, content: 'x', line: 1 });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('File not found');
    });

    it('rejects path outside workspace', async () => {
        const result = await tool.execute({ path: '/etc/passwd', content: 'x' });
        expect(result[0].status).toBe(ResultStatus.Error);
    });

    it('reports error for non-string content', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb\nc');
        const result = await tool.execute({ path: filePath, content: 42, line: 1 });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('content must be a string');
    });

    it('reports error when path is a directory', async () => {
        const result = await tool.execute({ path: tmpDir, content: 'x', line: 1 });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('not a file');
    });

    it('reports error when file exceeds maxFileSize', async () => {
        const fc = new FileConfiguration(100, 5, false);
        const localTool = new InsertFileContentTool(ws, fc);
        const filePath = createTempFile(tmpDir, 'test.txt', 'this file is too large');
        const result = await localTool.execute({ path: filePath, content: 'x', line: 1 });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('max');
    });

    it('reports error when content exceeds maxCharsPerFile', async () => {
        const fc = new FileConfiguration(5, undefined, false);
        const localTool = new InsertFileContentTool(ws, fc);
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb');
        const result = await localTool.execute({ path: filePath, content: 'too long content' });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('max length');
        expect(result[0].result).toMatch(/Resulting file would be \d+ chars, exceeds max length of 5/);
    });

    it('reports error for binary file', async () => {
        const filePath = createTempFile(tmpDir, 'test.bin', '\x00\x01\x02');
        const result = await tool.execute({ path: filePath, content: 'x', line: 1 });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('binary');
    });

    it('handles writeFile failure', async () => {
        vi.mocked(fsp.writeFile).mockRejectedValueOnce(new Error('write failed'));
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb\nc');
        const result = await tool.execute({ path: filePath, content: 'x', line: 2 });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('write failed');
    });
});

describe('InsertFileContentTool - without fileConfig', () => {
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
        const localTool = new InsertFileContentTool(ws);
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb\nc');
        const result = await localTool.execute({ path: filePath, content: 'x', line: 2 });
        expect(result[0].status).toBe(ResultStatus.Success);
    });
});

describe('InsertFileContentTool - requireReadBeforeWrite', () => {
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
        const localTool = new InsertFileContentTool(ws, fc, fp);
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb\nc');
        const result = await localTool.execute({ path: filePath, content: 'x', line: 2 });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('must be read');
    });

    it('accepts write after read', async () => {
        const fc = new FileConfiguration(undefined, undefined, true);
        const fp = new FilePool(fc);
        const localTool = new InsertFileContentTool(ws, fc, fp);
        const filePath = createTempFile(tmpDir, 'test.txt', 'a\nb\nc');
        await fp.recordRead(filePath);
        const result = await localTool.execute({ path: filePath, content: 'x', line: 2 });
        expect(result[0].status).toBe(ResultStatus.Success);
    });
});
