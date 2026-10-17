import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ResultStatus, type ToolResult } from '@johannes.latzel/llm-chat';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { SearchEntriesTool } from '../../src/index.js';
import { SearchConfiguration, FileConfiguration } from '../../src/lib/config.js';
import { AccessType, DirectoryConfiguration, Workspace } from '@johannes.latzel/llm-chat-workspace';
import { createTempDir, removeTempDir, createTempFile, createTempDirStructure } from '../index.js';

describe('SearchEntriesTool, filters and limits', () => {
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

    it('type: "both" explicitly returns files and directories', async () => {
        mkdirSync(path.join(tmpDir, 'data'), { recursive: true });
        createTempFile(tmpDir, 'readme.txt', '');
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ name_pattern: 'data|readme', type: 'both' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
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
