import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResultStatus, type ToolResult } from '@johannes.latzel/llm-chat';
import { mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import * as fsp from 'node:fs/promises';
import { SearchEntriesTool } from '../../src/index.js';
import { SearchConfiguration, FileConfiguration, DirectoryConfiguration } from '../../src/lib/config.js';
import { Workspace } from '../../src/lib/workspace.js';
import { AccessType } from '../../src/lib/types.js';
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

describe('SearchEntriesTool — content search', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
    });

    afterEach(() => {
        removeTempDir(tmpDir);
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

    it('returns summary when too many entries visited', async () => {
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

describe('SearchEntriesTool — name search', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
    });

    afterEach(() => {
        removeTempDir(tmpDir);
    });

    it('finds files by name pattern', async () => {
        createTempDirStructure(tmpDir, {
            'hello.txt': '',
            'world.txt': '',
            'other.js': ''
        });
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ name_pattern: '\\.txt$' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('hello.txt');
        expect(result.result).toContain('world.txt');
        expect(result.result).not.toContain('other.js');
    });

    it('is case-insensitive by default', async () => {
        createTempFile(tmpDir, 'HELLO.TXT', '');
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ name_pattern: 'hello' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('HELLO.TXT');
    });

    it('returns error for invalid regex', async () => {
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ name_pattern: '[invalid' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('Invalid name_pattern regex');
    });

    it('respects path scope', async () => {
        mkdirSync(path.join(tmpDir, 'sub'), { recursive: true });
        createTempFile(tmpDir, 'data.txt', '');
        createTempFile(tmpDir, 'sub/data.txt', '');
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ name_pattern: 'data', path: 'sub' }) as [ToolResult];
        expect(result.result).toContain('data.txt');
        expect(result.result).not.toContain(tmpDir + '/data.txt');
    });

    it('skips ignored directories', async () => {
        const ws2 = new Workspace(new DirectoryConfiguration(
            [{ type: AccessType.Write, path: tmpDir }],
            ['node_modules'],
        ));
        mkdirSync(path.join(tmpDir, 'node_modules'), { recursive: true });
        createTempFile(tmpDir, 'node_modules/pkg/index.js', '');
        const tool = new SearchEntriesTool(ws2);
        const [result] = await tool.execute({ name_pattern: 'index' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toBe('No matching entries found');
    });
});

describe('SearchEntriesTool — directory search', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
    });

    afterEach(() => {
        removeTempDir(tmpDir);
    });

    it('finds directories by name pattern with type: directory', async () => {
        mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
        mkdirSync(path.join(tmpDir, 'test'), { recursive: true });
        mkdirSync(path.join(tmpDir, 'lib'), { recursive: true });
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ name_pattern: 'src|test', type: 'directory' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('src/');
        expect(result.result).toContain('test/');
        expect(result.result).not.toContain('lib/');
    });

    it('appends trailing slash to directory results', async () => {
        mkdirSync(path.join(tmpDir, 'mydir'), { recursive: true });
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ name_pattern: 'mydir', type: 'directory' }) as [ToolResult];
        expect(result.result).toMatch(/mydir\//);
    });
});

describe('SearchEntriesTool — symlinks', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
    });

    afterEach(() => {
        removeTempDir(tmpDir);
    });

    it('skips symlinks in search results', async () => {
        createTempFile(tmpDir, 'real.txt', 'data');
        symlinkSync('/nonexistent', path.join(tmpDir, 'broken-link'));
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({}) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('real.txt');
        expect(result.result).not.toContain('broken-link');
    });
});

describe('SearchEntriesTool — merged behavior', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
    });

    afterEach(() => {
        removeTempDir(tmpDir);
    });

    it('returns everything with no patterns', async () => {
        createTempDirStructure(tmpDir, {
            'a.txt': 'hello',
            'b.txt': 'world'
        });
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({}) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('a.txt');
        expect(result.result).toContain('b.txt');
    });

    it('type: file returns only files (not directories)', async () => {
        mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
        createTempFile(tmpDir, 'src/index.txt', 'data');
        createTempFile(tmpDir, 'readme.txt', 'data');
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ content_pattern: 'data', type: 'file' }) as [ToolResult];
        expect(result.result).toContain('readme.txt');
        expect(result.result).toContain('index.txt');
        const lines = result.result!.split('\n');
        expect(lines).toHaveLength(2);
        lines.forEach((line) => expect(line).not.toMatch(/\/$/));
    });

    it('type: directory returns only directories (not files)', async () => {
        mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
        createTempFile(tmpDir, 'readme.txt', 'data');
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ name_pattern: 'src|readme', type: 'directory' }) as [ToolResult];
        expect(result.result).toContain('src/');
        expect(result.result).not.toContain('readme.txt');
    });

    it('type: both (default) returns files and directories', async () => {
        mkdirSync(path.join(tmpDir, 'data'), { recursive: true });
        createTempFile(tmpDir, 'readme.txt', '');
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ name_pattern: 'data|readme' }) as [ToolResult];
        expect(result.result).toContain('data/');
        expect(result.result).toContain('readme.txt');
    });

    it('AND logic: both name_pattern and content_pattern must match', async () => {
        createTempFile(tmpDir, 'match.txt', 'secret content');
        createTempFile(tmpDir, 'match.js', 'secret content');
        createTempFile(tmpDir, 'other.txt', 'secret content');
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ name_pattern: '\\.txt$', content_pattern: 'secret' }) as [ToolResult];
        expect(result.result).toContain('match.txt');
        expect(result.result).not.toContain('match.js');
        expect(result.result).toContain('other.txt');
    });

    it('max_size filters files by size', async () => {
        createTempFile(tmpDir, 'small.txt', 'tiny');
        createTempFile(tmpDir, 'large.txt', 'x'.repeat(1000));
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ content_pattern: '.', max_size: 100 }) as [ToolResult];
        expect(result.result).toContain('small.txt');
        expect(result.result).not.toContain('large.txt');
    });

    it('max_size is capped by file config maxFileSize', async () => {
        createTempFile(tmpDir, 'f.txt', 'hello');
        const tool = new SearchEntriesTool(
            ws,
            undefined,
            new FileConfiguration(10000, 500)
        );
        const [result] = await tool.execute({ content_pattern: 'hello', max_size: 99999 }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('f.txt');
    });

    it('returns partial results on timeout', async () => {
        const files: Record<string, string> = {};
        for (let i = 0; i < 50; i++) {
            files[`f${i}.txt`] = 'data';
        }
        createTempDirStructure(tmpDir, files);
        const tool = new SearchEntriesTool(ws, new SearchConfiguration(50, 200, 5000, 0));
        const [result] = await tool.execute({ content_pattern: 'data' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('timed out');
    });

    it('returns line-level content matches', async () => {
        createTempFile(tmpDir, 'code.ts', 'line1\nTODO: fix this\nline3\nTODO: another');
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ content_pattern: 'TODO' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        const lines = result.result!.split('\n');
        expect(lines.length).toBe(2);
        expect(lines[0]).toMatch(/:2: /);
        expect(lines[1]).toMatch(/:4: /);
    });

    it('rejects invalid type value', async () => {
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ name_pattern: 'test', type: 'invalid' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('Invalid type parameter');
    });

    it('stops scanning lines within a file when maxResults reached', async () => {
        createTempFile(tmpDir, 'f.txt', 'match\nmatch\nmatch\nmatch');
        const tool = new SearchEntriesTool(ws, new SearchConfiguration(2));
        const [result] = await tool.execute({ content_pattern: 'match' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        const lines = result.result!.split('\n');
        expect(lines.length).toBe(2);
    });

    it('includes timestamp info with content matches when timestamp filter active', async () => {
        createTempFile(tmpDir, 'f.txt', 'hello');
        const past = new Date(Date.now() - 86400000).toISOString();
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ content_pattern: 'hello', created_after: past }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toMatch(/\(created: .+modified: .+\)/);
    });
});

describe('SearchEntriesTool — timestamp invalid dates', () => {
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

    it('reports invalid created_after date', async () => {
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ created_after: 'not-a-date' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('created_after');
    });

    it('reports invalid created_before date', async () => {
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ created_before: 'bad-date' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('created_before');
    });

    it('reports invalid modified_after date', async () => {
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ modified_after: 'bad-date' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('modified_after');
    });

    it('reports invalid modified_before date', async () => {
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ modified_before: 'bad-date' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('modified_before');
    });
});

describe('SearchEntriesTool — timestamp filtering', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        createTempFile(tmpDir, 'f1.txt', 'data');
        createTempFile(tmpDir, 'f2.txt', 'data');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        removeTempDir(tmpDir);
    });

    it('filters with created_after future date — no results', async () => {
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ created_after: '2099-01-01T00:00:00.000Z' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('No matching');
    });

    it('filters with created_before past date — no results', async () => {
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ created_before: '2020-01-01T00:00:00.000Z' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('No matching');
    });

    it('filters with modified_after future date — no results', async () => {
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ modified_after: '2099-01-01T00:00:00.000Z' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('No matching');
    });

    it('filters with modified_before past date — no results', async () => {
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ modified_before: '2020-01-01T00:00:00.000Z' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('No matching');
    });

    it('appends timestamp info when timestamp filter is active', async () => {
        const now = new Date();
        const past = new Date(now.getTime() - 86400000).toISOString();
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ created_after: past }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toMatch(/\(created: .+modified: .+\)/);
    });
});

describe('SearchEntriesTool — timestamp error handling', () => {
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

    it('continues on stat failure during timestamp search', async () => {
        writeFileSync(path.join(tmpDir, 'keep.txt'), 'data');
        writeFileSync(path.join(tmpDir, 'gone.txt'), 'data');
        const fallbackStat = vi.mocked(fsp.stat).getMockImplementation()!;
        vi.mocked(fsp.stat).mockImplementation(async (p: any) => {
            if (p.toString().includes('gone.txt')) throw new Error('not found');
            return fallbackStat(p);
        });
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ created_after: '2020-01-01T00:00:00.000Z' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('keep.txt');
    });

    it('handles walk failure in timestamp search', async () => {
        vi.mocked(fsp.readdir).mockResolvedValueOnce([
            { name: 'bad', isDirectory: () => { throw new Error('walk error'); }, isFile: () => false } as any
        ]);
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({}) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('Error searching');
    });
});

describe('SearchEntriesTool — walk error callback', () => {
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

    it('reports warning when a subdirectory cannot be read', async () => {
        createTempDirStructure(tmpDir, {
            'good.txt': 'data',
            'sub/f.txt': 'data',
        });
        const realReaddir = vi.mocked(fsp.readdir).getMockImplementation()!;
        vi.mocked(fsp.readdir)
            .mockImplementationOnce(realReaddir)
            .mockRejectedValueOnce(new Error('permission denied'));
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({}) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Warning');
        expect(result.result).toContain('could not read');
        expect(result.result).toContain('good.txt');
    });

    it('reports no warning when all directories readable', async () => {
        createTempDirStructure(tmpDir, {
            'good.txt': 'data',
            'sub/f.txt': 'data',
        });
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({}) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).not.toContain('Warning');
        expect(result.result).toContain('good.txt');
        expect(result.result).toContain('sub/f.txt');
    });

    it('reports walk error warning when display limit exceeded', async () => {
        const walkMock = vi.spyOn(ws, 'walk');
        const subDir = path.join(tmpDir, 'sub');
        walkMock.mockImplementation(async function* (dir: string, onError?: (p: string, e: Error) => void) {
            yield { filePath: path.join(tmpDir, 'f1.txt'), dirent: { isDirectory: () => false, isFile: () => true, name: 'f1.txt' } as any };
            yield { filePath: subDir, dirent: { isDirectory: () => true, isFile: () => false, name: 'sub' } as any };
            onError?.(subDir, new Error('permission denied'));
            yield { filePath: path.join(tmpDir, 'f2.txt'), dirent: { isDirectory: () => false, isFile: () => true, name: 'f2.txt' } as any };
            yield { filePath: path.join(tmpDir, 'f3.txt'), dirent: { isDirectory: () => false, isFile: () => true, name: 'f3.txt' } as any };
        });
        const sc = new SearchConfiguration(50, 2, 5000);
        const tool = new SearchEntriesTool(ws, sc);
        const [result] = await tool.execute({}) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Warning');
        expect(result.result).toContain('could not read');
        expect(result.result).toContain('Searched');
    });

    it('reports plural walk error warning when multiple subdirectories unreadable', async () => {
        createTempDirStructure(tmpDir, {
            'good.txt': 'data',
            'sub1/f.txt': 'data',
            'sub2/g.txt': 'data',
        });
        const realReaddir = vi.mocked(fsp.readdir).getMockImplementation()!;
        vi.mocked(fsp.readdir)
            .mockImplementationOnce(realReaddir)
            .mockRejectedValueOnce(new Error('err1'))
            .mockRejectedValueOnce(new Error('err2'));
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({}) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Warning');
        expect(result.result).toContain('could not read 2 directories');
    });
});
