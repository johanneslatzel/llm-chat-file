import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResultStatus } from '@johannes.latzel/llm-chat';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { ReplaceFileContentTool } from '../../src/index.js';
import { FileConfiguration, DirectoryConfiguration } from '../../src/lib/config.js';
import { FilePool } from '../../src/lib/file-pool.js';
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
        stat: vi.fn(mod.stat)
    };
});

describe('ReplaceFileContentTool', () => {
    let tmpDir: string;
    let ws: Workspace;
    let tool: ReplaceFileContentTool;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        tool = new ReplaceFileContentTool(ws, new FileConfiguration(undefined, undefined, false));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        removeTempDir(tmpDir);
    });

    it('replaces first occurrence of a substring', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'hello foo world foo');
        const result = await tool.execute({
            paths: [filePath],
            old_content: 'foo',
            new_content: 'bar'
        });
        expect(result[0].status).toBe(ResultStatus.Success);
        expect(result[0].result).toContain('Replaced');
        const content = await fsp.readFile(filePath, 'utf-8');
        expect(content).toBe('hello bar world foo');
    });

    it('replaces all occurrences when replace_all is true', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'hello foo world foo');
        const result = await tool.execute({
            paths: [filePath],
            old_content: 'foo',
            new_content: 'bar',
            replace_all: true
        });
        expect(result[0].status).toBe(ResultStatus.Success);
        const content = await fsp.readFile(filePath, 'utf-8');
        expect(content).toBe('hello bar world bar');
    });

    it('deletes matched substring when new_content is empty', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'hello foo world');
        const result = await tool.execute({
            paths: [filePath],
            old_content: 'foo',
            new_content: ''
        });
        expect(result[0].status).toBe(ResultStatus.Success);
        const content = await fsp.readFile(filePath, 'utf-8');
        expect(content).toBe('hello  world');
    });

    it('reports error when old_content is not found (single replace)', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'hello world');
        const result = await tool.execute({
            paths: [filePath],
            old_content: 'nonexistent',
            new_content: 'x'
        });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('not found');
    });

    it('reports error when old_content is not found (replace_all)', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'hello world');
        const result = await tool.execute({
            paths: [filePath],
            old_content: 'nonexistent',
            new_content: 'x',
            replace_all: true
        });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('not found');
    });

    it('reports error when file does not exist', async () => {
        const filePath = path.join(tmpDir, 'nonexistent.txt');
        const result = await tool.execute({
            paths: [filePath],
            old_content: 'x',
            new_content: 'y'
        });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('File not found');
    });

    it('rejects path outside workspace', async () => {
        const result = await tool.execute({
            paths: ['/etc/passwd'],
            old_content: 'x',
            new_content: 'y'
        });
        expect(result[0].status).toBe(ResultStatus.Error);
    });

    it('reports error for non-string old_content', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'hello world');
        const result = await tool.execute({
            paths: [filePath],
            old_content: 42,
            new_content: 'y'
        });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('old_content must be a string');
    });

    it('reports error for non-string new_content', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'hello world');
        const result = await tool.execute({
            paths: [filePath],
            old_content: 'hello',
            new_content: 42
        });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('new_content must be a string');
    });

    it('reports error when path is a directory', async () => {
        const result = await tool.execute({
            paths: [tmpDir],
            old_content: 'x',
            new_content: 'y'
        });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('not a file');
    });

    it('reports error when file exceeds maxFileSize', async () => {
        const fc = new FileConfiguration(100, 5, false);
        const localTool = new ReplaceFileContentTool(ws, fc);
        const filePath = createTempFile(tmpDir, 'test.txt', 'this file is too large');
        const result = await localTool.execute({
            paths: [filePath],
            old_content: 'file',
            new_content: 'x'
        });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('max');
    });

    it('reports error when result exceeds maxCharsPerFile', async () => {
        const fc = new FileConfiguration(10, undefined, false);
        const localTool = new ReplaceFileContentTool(ws, fc);
        const filePath = createTempFile(tmpDir, 'test.txt', 'a');
        const result = await localTool.execute({
            paths: [filePath],
            old_content: 'a',
            new_content: 'this is too long content'
        });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('max length');
    });

    it('reports error for binary file', async () => {
        const filePath = createTempFile(tmpDir, 'test.bin', '\x00\x01\x02');
        const result = await tool.execute({
            paths: [filePath],
            old_content: 'x',
            new_content: 'y'
        });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('binary');
    });

    it('handles writeFile failure', async () => {
        vi.mocked(fsp.writeFile).mockRejectedValueOnce(new Error('write failed'));
        const filePath = createTempFile(tmpDir, 'test.txt', 'hello foo');
        const result = await tool.execute({
            paths: [filePath],
            old_content: 'foo',
            new_content: 'bar'
        });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('write failed');
    });

    it('replaces substring that appears at start of file', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'foo bar');
        const result = await tool.execute({
            paths: [filePath],
            old_content: 'foo',
            new_content: 'baz'
        });
        expect(result[0].status).toBe(ResultStatus.Success);
        const content = await fsp.readFile(filePath, 'utf-8');
        expect(content).toBe('baz bar');
    });

    it('replaces substring that appears at end of file', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'bar foo');
        const result = await tool.execute({
            paths: [filePath],
            old_content: 'foo',
            new_content: 'baz'
        });
        expect(result[0].status).toBe(ResultStatus.Success);
        const content = await fsp.readFile(filePath, 'utf-8');
        expect(content).toBe('bar baz');
    });

    it('handles replace_all with overlapping matches correctly', async () => {
        const filePath = createTempFile(tmpDir, 'test.txt', 'aaa');
        const result = await tool.execute({
            paths: [filePath],
            old_content: 'aa',
            new_content: 'b',
            replace_all: true
        });
        expect(result[0].status).toBe(ResultStatus.Success);
        const content = await fsp.readFile(filePath, 'utf-8');
        expect(content).toBe('ba');
    });
});

describe('ReplaceFileContentTool - batching', () => {
    let tmpDir: string;
    let ws: Workspace;
    let tool: ReplaceFileContentTool;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        tool = new ReplaceFileContentTool(ws, new FileConfiguration(undefined, undefined, false));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        removeTempDir(tmpDir);
    });

    it('rejects non-array paths', async () => {
        const result = await tool.execute({ paths: 'not-array', old_content: 'x', new_content: 'y' });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('must be an array');
    });

    it('rejects empty paths array', async () => {
        const result = await tool.execute({ paths: [], old_content: 'x', new_content: 'y' });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('non-empty');
    });

    it('replaces in multiple files', async () => {
        const fa = createTempFile(tmpDir, 'a.txt', 'hello world');
        const fb = createTempFile(tmpDir, 'b.txt', 'hello there');
        const result = await tool.execute({
            paths: [fa, fb],
            old_content: 'hello',
            new_content: 'hi'
        });
        expect(result).toHaveLength(2);
        expect(result[0].status).toBe(ResultStatus.Success);
        expect(result[1].status).toBe(ResultStatus.Success);
        const ca = await fsp.readFile(fa, 'utf-8');
        const cb = await fsp.readFile(fb, 'utf-8');
        expect(ca).toBe('hi world');
        expect(cb).toBe('hi there');
    });

    it('partially fails when one path is invalid', async () => {
        const fa = createTempFile(tmpDir, 'a.txt', 'hello');
        const result = await tool.execute({
            paths: [fa, '/etc/passwd', 'nonexistent'],
            old_content: 'hello',
            new_content: 'hi'
        });
        expect(result).toHaveLength(3);
        expect(result[0].status).toBe(ResultStatus.Success);
        expect(result[1].status).toBe(ResultStatus.Error);
        expect(result[2].status).toBe(ResultStatus.Error);
    });

    it('rejects non-string path in array', async () => {
        const result = await tool.execute({
            paths: ['valid.txt', 42],
            old_content: 'x',
            new_content: 'y'
        });
        expect(result[1].status).toBe(ResultStatus.Error);
        expect(result[1].result).toContain('Path must be a non-empty string');
    });

    it('rejects empty string path in array', async () => {
        const result = await tool.execute({
            paths: ['valid.txt', ''],
            old_content: 'x',
            new_content: 'y'
        });
        expect(result[1].status).toBe(ResultStatus.Error);
        expect(result[1].result).toContain('Path must be a non-empty string');
    });

    it('rejects whitespace-only path in array', async () => {
        const result = await tool.execute({
            paths: ['valid.txt', '   '],
            old_content: 'x',
            new_content: 'y'
        });
        expect(result[1].status).toBe(ResultStatus.Error);
        expect(result[1].result).toContain('Path must be a non-empty string');
    });
});

describe('ReplaceFileContentTool - without fileConfig', () => {
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
        const localTool = new ReplaceFileContentTool(ws);
        const filePath = createTempFile(tmpDir, 'test.txt', 'hello world');
        const result = await localTool.execute({ paths: [filePath], old_content: 'hello', new_content: 'hi' });
        expect(result[0].status).toBe(ResultStatus.Success);
    });
});

describe('ReplaceFileContentTool - requireReadBeforeWrite', () => {
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
        const localTool = new ReplaceFileContentTool(ws, fc, fp);
        const filePath = createTempFile(tmpDir, 'test.txt', 'hello world');
        const result = await localTool.execute({ paths: [filePath], old_content: 'hello', new_content: 'hi' });
        expect(result[0].status).toBe(ResultStatus.Error);
        expect(result[0].result).toContain('must be read');
    });

    it('accepts write after read', async () => {
        const fc = new FileConfiguration(undefined, undefined, true);
        const fp = new FilePool(fc);
        const localTool = new ReplaceFileContentTool(ws, fc, fp);
        const filePath = createTempFile(tmpDir, 'test.txt', 'hello world');
        await fp.recordRead(filePath);
        const result = await localTool.execute({ paths: [filePath], old_content: 'hello', new_content: 'hi' });
        expect(result[0].status).toBe(ResultStatus.Success);
    });
});
