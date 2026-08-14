import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResultStatus, type ToolResult } from '@johannes.latzel/llm-chat';
import { writeFileSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { ReadFileTool } from '../../src/index.js';
import { FileConfiguration } from '../../src/lib/config.js';
import { AccessType, DirectoryConfiguration, Workspace } from '@johannes.latzel/llm-chat-workspace';
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
        const [result] = await tool.execute({ paths: ['hello.txt'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Hello, world!');
        expect(result.result).toMatch(/\(\s*lines \d+-\d+ of \d+, \d+ chars\)/);
    });

    it('reports missing paths parameter', async () => {
        const tool = new ReadFileTool(ws, fc);
        const [result] = await tool.execute({}) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('"paths"');
    });

    it('reports file not found', async () => {
        const tool = new ReadFileTool(ws, fc);
        const [result] = await tool.execute({ paths: ['nonexistent.txt'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('reports error for outside accessible directory', async () => {
        const tool = new ReadFileTool(ws, fc);
        const [result] = await tool.execute({ paths: ['/etc/passwd'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('reports error for empty path in array', async () => {
        const tool = new ReadFileTool(ws, fc);
        const [result] = await tool.execute({ paths: [''] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('non-empty string');
    });

    it('reports error for whitespace-only path in array', async () => {
        const tool = new ReadFileTool(ws, fc);
        const [result] = await tool.execute({ paths: ['   '] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('non-empty string');
    });

    it('reads specific line range', async () => {
        createTempFile(tmpDir, 'lines.txt', 'line1\nline2\nline3\nline4\nline5\n');
        const tool = new ReadFileTool(ws, fc);
        const [result] = await tool.execute({ paths: ['lines.txt'], start_line: 2, end_line: 4 }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('line2');
        expect(result.result).toContain('line3');
        expect(result.result).toContain('line4');
        expect(result.result).not.toContain('line1');
        expect(result.result).not.toContain('line5');
        expect(result.result).toMatch(/of 6, 30 chars\)/);
    });

    it('truncates content exceeding max_chars', async () => {
        createTempFile(tmpDir, 'long.txt', 'x'.repeat(200));
        const tool = new ReadFileTool(ws, fc);
        const [result] = await tool.execute({ paths: ['long.txt'], max_chars: 50 }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('[truncated]');
        expect(result.result.length).toBeLessThan(200);
        expect(result.result).toMatch(/of 1, 200 chars\)/);
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
        const [result] = await tool.execute({ paths: [path.join(tmpDir, 'abs.txt')] }) as [ToolResult];
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
        const [result] = await tool.execute({ paths: ['clamp.txt'], start_line: 0 }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('line1');
    });

    it('caps max_chars at maxCharsPerFile', async () => {
        const smallFc = new FileConfiguration(5);
        const smallWs = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        createTempFile(tmpDir, 'caps.txt', 'hello world this exceeds the limit');
        const tool = new ReadFileTool(smallWs, smallFc);
        const [result] = await tool.execute({ paths: ['caps.txt'], max_chars: 100 }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('[truncated]');
    });

    it('reports error when path is a directory', async () => {
        const tool = new ReadFileTool(ws, fc);
        const [result] = await tool.execute({ paths: ['.'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('not a file');
    });

    it('reports error for binary file', async () => {
        const binPath = path.join(tmpDir, 'binary.bin');
        writeFileSync(binPath, Buffer.from([0x00, 0x01, 0x02, 0xFF]));
        const tool = new ReadFileTool(ws, fc);
        const [result] = await tool.execute({ paths: ['binary.bin'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('binary');
    });
});

describe('filesystem, ReadFileTool catch', () => {
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
        const [result] = await tool.execute({ paths: ['target.txt'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('disk error');
    });

    it('rejects files exceeding maxFileSize', async () => {
        createTempFile(tmpDir, 'big.txt', 'x'.repeat(100));
        const fc = new FileConfiguration(10000, 50);
        const tool = new ReadFileTool(ws, fc);
        const [result] = await tool.execute({ paths: ['big.txt'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('too large');
    });

    it('reads files within maxFileSize', async () => {
        createTempFile(tmpDir, 'small.txt', 'small content');
        const fc = new FileConfiguration(10000, 50);
        const tool = new ReadFileTool(ws, fc);
        const [result] = await tool.execute({ paths: ['small.txt'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('small content');
    });

    it('clamps negative max_chars to 1', async () => {
        createTempFile(tmpDir, 'neg.txt', 'line1\nline2\nline3');
        const tool = new ReadFileTool(ws, fc);
        const [result] = await tool.execute({ paths: ['neg.txt'], max_chars: -5 }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('[truncated]');
        expect(result.result).not.toContain('line1');
    });

    it('treats negative end_line as no limit', async () => {
        createTempFile(tmpDir, 'neg-end.txt', 'line1\nline2\nline3');
        const tool = new ReadFileTool(ws, fc);
        const [result] = await tool.execute({ paths: ['neg-end.txt'], end_line: -1 }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('line3');
    });
});

describe('ReadFileTool - batch', () => {
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

    it('reads multiple files in batch', async () => {
        createTempFile(tmpDir, 'a.txt', 'content a');
        createTempFile(tmpDir, 'b.txt', 'content b');
        createTempFile(tmpDir, 'c.txt', 'content c');
        const tool = new ReadFileTool(ws);
        const results = await tool.execute({ paths: ['a.txt', 'b.txt', 'c.txt'] });
        expect(results).toHaveLength(3);
        expect(results[0].status).toBe(ResultStatus.Success);
        expect(results[0].result).toContain('content a');
        expect(results[1].status).toBe(ResultStatus.Success);
        expect(results[1].result).toContain('content b');
        expect(results[2].status).toBe(ResultStatus.Success);
        expect(results[2].result).toContain('content c');
    });

    it('batch with single file in paths array', async () => {
        createTempFile(tmpDir, 'single.txt', 'just one');
        const tool = new ReadFileTool(ws);
        const results = await tool.execute({ paths: ['single.txt'] });
        expect(results).toHaveLength(1);
        expect(results[0].status).toBe(ResultStatus.Success);
        expect(results[0].result).toContain('just one');
    });

    it('batch returns partial errors when some files fail', async () => {
        createTempFile(tmpDir, 'good.txt', 'this is fine');
        createTempFile(tmpDir, 'good2.txt', 'also fine');
        const tool = new ReadFileTool(ws);
        const results = await tool.execute({ paths: ['good.txt', 'missing.txt', 'good2.txt'] });
        expect(results).toHaveLength(3);
        expect(results[0].status).toBe(ResultStatus.Success);
        expect(results[0].result).toContain('this is fine');
        expect(results[1].status).toBe(ResultStatus.Error);
        expect(results[1].result).toContain('File not found');
        expect(results[2].status).toBe(ResultStatus.Success);
        expect(results[2].result).toContain('also fine');
    });

    it('batch rejects empty paths array', async () => {
        const tool = new ReadFileTool(ws);
        const [result] = await tool.execute({ paths: [] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('non-empty');
    });

    it('batch rejects non-array paths', async () => {
        const tool = new ReadFileTool(ws);
        const [result] = await tool.execute({ paths: 'not-an-array' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('array');
    });

    it('batch rejects paths with non-string elements', async () => {
        createTempFile(tmpDir, 'ok.txt', 'should succeed');
        const tool = new ReadFileTool(ws);
        const results = await tool.execute({ paths: ['ok.txt', 42] });
        expect(results).toHaveLength(2);
        expect(results[0].status).toBe(ResultStatus.Success);
        expect(results[0].result).toContain('ok.txt');
        expect(results[1].status).toBe(ResultStatus.Error);
        expect(results[1].result).toContain('non-empty string');
    });

    it('batch returs error for files outside accessible directory', async () => {
        createTempFile(tmpDir, 'inside.txt', 'accessible');
        const tool = new ReadFileTool(ws);
        const results = await tool.execute({ paths: ['inside.txt', '/etc/passwd'] });
        expect(results).toHaveLength(2);
        expect(results[0].status).toBe(ResultStatus.Success);
        expect(results[0].result).toContain('accessible');
        expect(results[1].status).toBe(ResultStatus.Error);
        expect(results[1].result).toContain('Invalid or inaccessible');
    });

    it('batch with max_chars applies truncation per file', async () => {
        createTempFile(tmpDir, 'long1.txt', 'x'.repeat(100));
        createTempFile(tmpDir, 'long2.txt', 'y'.repeat(100));
        const tool = new ReadFileTool(ws);
        const results = await tool.execute({ paths: ['long1.txt', 'long2.txt'], max_chars: 10 });
        expect(results).toHaveLength(2);
        expect(results[0].status).toBe(ResultStatus.Success);
        expect(results[0].result).toContain('[truncated]');
        expect(results[1].status).toBe(ResultStatus.Success);
        expect(results[1].result).toContain('[truncated]');
    });

    it('batch with line ranges', async () => {
        createTempFile(tmpDir, 'lines1.txt', 'a1\na2\na3\na4\na5\n');
        createTempFile(tmpDir, 'lines2.txt', 'b1\nb2\nb3\nb4\nb5\n');
        const tool = new ReadFileTool(ws);
        const results = await tool.execute({ paths: ['lines1.txt', 'lines2.txt'], start_line: 2, end_line: 4 });
        expect(results).toHaveLength(2);
        expect(results[0].status).toBe(ResultStatus.Success);
        expect(results[0].result).toContain('a2');
        expect(results[0].result).not.toContain('a1');
        expect(results[0].result).not.toContain('a5');
        expect(results[1].status).toBe(ResultStatus.Success);
        expect(results[1].result).toContain('b2');
        expect(results[1].result).not.toContain('b1');
        expect(results[1].result).not.toContain('b5');
    });
});
