import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResultStatus, type ToolResult } from '@johannes.latzel/llm-chat';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import * as fsp from 'node:fs/promises';
import { SearchEntriesTool } from '../../src/index.js';
import { SearchConfiguration } from '../../src/lib/config.js';
import { AccessType, DirectoryConfiguration, Workspace } from '@johannes.latzel/llm-chat-workspace';
import { createTempDir, removeTempDir, createTempFile, createTempDirStructure } from '../index.js';

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

describe('SearchEntriesTool, content search', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
    });

    afterEach(() => {
        removeTempDir(tmpDir);
    });

    it('returns an actionable error when path points at a file', async () => {
        createTempFile(tmpDir, 'plain.txt', 'hello');
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({
            content_pattern: 'hello',
            path: path.join(tmpDir, 'plain.txt')
        }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('is a file, not a directory');
        expect(result.result).toContain('read_file');
        expect(result.result).toContain(tmpDir);
        expect(result.result).not.toContain('No matching entries found');
    });

    it('reports missing search paths instead of empty results', async () => {
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({
            content_pattern: 'hello',
            path: path.join(tmpDir, 'does-not-exist')
        }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('Path not found');
        expect(result.result).toContain('entry_info');
        expect(result.result).not.toContain('No matching entries found');
    });

    it('reports access failures on the search root', async () => {
        vi.mocked(fsp.stat).mockRejectedValueOnce(
            Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
        );
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({
            content_pattern: 'hello',
            path: tmpDir
        }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('cannot access');
    });

    it('still searches file contents when given the containing directory', async () => {
        createTempFile(tmpDir, 'needle.txt', 'findme marker');
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({
            content_pattern: 'findme',
            path: tmpDir
        }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('needle.txt');
    });

    it('finds files by content pattern', async () => {
        createTempDirStructure(tmpDir, {
            'a.txt': 'hello world',
            'b.txt': 'goodbye world',
            'c.txt': 'nothing'
        });
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ content_pattern: 'hello' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('hello');
        expect(result.result).not.toContain('goodbye');
    });

    it('is case-insensitive by default', async () => {
        createTempFile(tmpDir, 'file.txt', 'Hello World');
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ content_pattern: 'hello' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Hello World');
    });

    it('allows legacy escape sequences in content_pattern when strict=false', async () => {
        createTempFile(tmpDir, 'code.ts', "import api from './api'");
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ content_pattern: 'from.*[\\\'"].*api', strict: false }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('code.ts');
    });

    it('rejects legacy escape sequences with strict=true (default) and hints at strict=false', async () => {
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ content_pattern: 'from.*[\\\'"].*api' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('Invalid content_pattern regex');
        expect(result.result).toContain('strict=false');
    });

    it('rejects genuinely invalid regex regardless of strict setting', async () => {
        const tool = new SearchEntriesTool(ws);
        const [strictResult] = await tool.execute({ content_pattern: '[invalid', strict: true }) as [ToolResult];
        expect(strictResult.status).toBe(ResultStatus.Error);
        expect(strictResult.result).toContain('Invalid content_pattern regex');

        const [looseResult] = await tool.execute({ content_pattern: '[invalid', strict: false }) as [ToolResult];
        expect(looseResult.status).toBe(ResultStatus.Error);
        expect(looseResult.result).toContain('Invalid content_pattern regex');
    });

    it('accepts valid Unicode-safe regex with strict=true (default)', async () => {
        createTempFile(tmpDir, 'file.txt', 'Hello \u2603 world');
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ content_pattern: '\\u2603', strict: true }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('file.txt');
    });

    it('returns error for invalid regex', async () => {
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ content_pattern: '[invalid' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('Invalid content_pattern regex');
    });

    it('returns error for inaccessible path', async () => {
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ content_pattern: 'test', path: '/etc/something' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('Invalid or inaccessible path');
    });

    it('limits results by max_results', async () => {
        createTempDirStructure(tmpDir, {
            'a.txt': 'match',
            'b.txt': 'match',
            'c.txt': 'match',
            'd.txt': 'match'
        });
        const tool = new SearchEntriesTool(ws, new SearchConfiguration(2));
        const [result] = await tool.execute({ content_pattern: 'match' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result!.split('\n').length).toBeLessThanOrEqual(2);
    });

    it('uses max_results from execute args when provided', async () => {
        createTempDirStructure(tmpDir, {
            'a.txt': 'match',
            'b.txt': 'match',
            'c.txt': 'match',
        });
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ content_pattern: 'match', max_results: 2 }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        const lines = result.result!.split('\n');
        expect(lines.length).toBe(2);
    });

    it('lists matches when many entries are visited but the results stay below the display limit', async () => {
        const files: Record<string, string> = {};
        for (let i = 0; i < 10; i++) files[`f${i}.txt`] = i === 0 ? 'match' : 'other';
        createTempDirStructure(tmpDir, files);
        const tool = new SearchEntriesTool(ws, new SearchConfiguration(50, 2));
        const [result] = await tool.execute({ content_pattern: 'match' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('f0.txt:1: match');
        expect(result.result).not.toMatch(/Searched \d+ entries/);
    });

    it('returns a count summary when there are more results than maxDisplayEntries', async () => {
        const files: Record<string, string> = {};
        for (let i = 0; i < 5; i++) files[`f${i}.txt`] = 'match';
        createTempDirStructure(tmpDir, files);
        const tool = new SearchEntriesTool(ws, new SearchConfiguration(50, 3));
        const [result] = await tool.execute({ content_pattern: 'match' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toMatch(/Searched \d+ entries, found \d+ matches/);
    });

    it('aborts when too many entries visited', async () => {
        const files: Record<string, string> = {};
        for (let i = 0; i < 20; i++) files[`f${i}.txt`] = 'match';
        createTempDirStructure(tmpDir, files);
        const tool = new SearchEntriesTool(ws, new SearchConfiguration(50, 200, 5));
        const [result] = await tool.execute({ content_pattern: 'match' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('Searched too many entries');
    });

    it('returns "No matching entries found" when no matches', async () => {
        createTempFile(tmpDir, 'file.txt', 'hello');
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ content_pattern: 'nonexistent' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toBe('No matching entries found');
    });

    it('skips binary files', async () => {
        createTempFile(tmpDir, 'binary.bin', '\x00\x01\x02Hello');
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ content_pattern: 'Hello' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toBe('No matching entries found');
    });

    it('respects path scope', async () => {
        mkdirSync(path.join(tmpDir, 'sub'), { recursive: true });
        createTempFile(tmpDir, 'outside.txt', 'match');
        createTempFile(tmpDir, 'sub/inside.txt', 'match');
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ content_pattern: 'match', path: 'sub' }) as [ToolResult];
        expect(result.result).toContain('inside.txt');
        expect(result.result).not.toContain('outside.txt');
    });
});
