import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ResultStatus, type ToolResult } from '@johannes.latzel/llm-chat';
import { mkdirSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { SearchEntriesTool } from '../../src/index.js';
import { AccessType, DirectoryConfiguration, Workspace } from '@johannes.latzel/llm-chat-workspace';
import { createTempDir, removeTempDir, createTempFile, createTempDirStructure } from '../index.js';

describe('SearchEntriesTool, name search', () => {
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

    it('allows legacy escape sequences in name_pattern when strict=false', async () => {
        createTempFile(tmpDir, "it's.txt", '');
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ name_pattern: 'it\\\'s', strict: false }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain("it's.txt");
    });

    it('rejects legacy escape sequences in name_pattern with strict=true (default)', async () => {
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ name_pattern: 'it\\\'s' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('Invalid name_pattern regex');
        expect(result.result).toContain('strict=false');
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

describe('SearchEntriesTool, directory search', () => {
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

describe('SearchEntriesTool, symlinks', () => {
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
