import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResultStatus, type ToolResult } from '@johannes.latzel/llm-chat';
import path from 'node:path';
import { SearchEntriesTool } from '../../src/index.js';
import { SearchConfiguration } from '../../src/lib/config.js';
import { AccessType, DirectoryConfiguration, Workspace } from '@johannes.latzel/llm-chat-workspace';
import { createTempDir, removeTempDir, createTempDirStructure } from '../index.js';

describe('SearchEntriesTool, walk error callback', () => {
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
        const subDir = path.join(tmpDir, 'sub');
        vi.spyOn(ws, 'walk').mockImplementation(async function* (dir: string, onError?: (p: string, e: Error) => void) {
            yield { filePath: path.join(tmpDir, 'good.txt'), dirent: { isDirectory: () => false, isFile: () => true, name: 'good.txt' } as any };
            yield { filePath: subDir, dirent: { isDirectory: () => true, isFile: () => false, name: 'sub' } as any };
            onError?.(subDir, new Error('permission denied'));
        });
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
        const subDir1 = path.join(tmpDir, 'sub1');
        const subDir2 = path.join(tmpDir, 'sub2');
        vi.spyOn(ws, 'walk').mockImplementation(async function* (dir: string, onError?: (p: string, e: Error) => void) {
            yield { filePath: path.join(tmpDir, 'good.txt'), dirent: { isDirectory: () => false, isFile: () => true, name: 'good.txt' } as any };
            yield { filePath: subDir1, dirent: { isDirectory: () => true, isFile: () => false, name: 'sub1' } as any };
            onError?.(subDir1, new Error('err1'));
            yield { filePath: subDir2, dirent: { isDirectory: () => true, isFile: () => false, name: 'sub2' } as any };
            onError?.(subDir2, new Error('err2'));
        });
        const tool = new SearchEntriesTool(ws);
        const [result] = await tool.execute({}) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Warning');
        expect(result.result).toContain('could not read 2 directories');
    });
});
