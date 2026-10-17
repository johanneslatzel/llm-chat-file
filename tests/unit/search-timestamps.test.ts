import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResultStatus, type ToolResult } from '@johannes.latzel/llm-chat';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import * as fsp from 'node:fs/promises';
import { SearchEntriesTool } from '../../src/index.js';
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

describe('SearchEntriesTool, timestamp invalid dates', () => {
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

describe('SearchEntriesTool, timestamp filtering', () => {
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

    it('filters with created_after future date, no results', async () => {
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ created_after: '2099-01-01T00:00:00.000Z' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('No matching');
    });

    it('filters with created_before past date, no results', async () => {
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ created_before: '2020-01-01T00:00:00.000Z' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('No matching');
    });

    it('filters with modified_after future date, no results', async () => {
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({ modified_after: '2099-01-01T00:00:00.000Z' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('No matching');
    });

    it('filters with modified_before past date, no results', async () => {
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

describe('SearchEntriesTool, timestamp error handling', () => {
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
        vi.spyOn(ws, 'walk').mockImplementation(async function* () {
            const fail = true;
            if (fail) throw new Error('walk error');
            yield undefined;
        });
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({}) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('Error searching');
    });
});
