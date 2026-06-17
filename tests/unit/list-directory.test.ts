import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResultStatus, type ToolResult } from '@johannes.latzel/llm-chat';
import { mkdirSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { ListDirectoryTool } from '../../src/index.js';
import { SearchConfiguration, DirectoryConfiguration } from '../../src/lib/config.js';
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

describe('ListDirectoryTool', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        createTempDirStructure(tmpDir, {
            'file1.txt': 'a',
            'file2.txt': 'b',
            'subdir/file3.txt': 'c',
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        removeTempDir(tmpDir);
    });

    it('lists directory contents', async () => {
        const tool = new ListDirectoryTool(ws);
        const [result] = await tool.execute({ path: '.' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('file1.txt');
        expect(result.result).toContain('file2.txt');
        expect(result.result).toContain('subdir/');
    });

    it('lists recursively', async () => {
        const tool = new ListDirectoryTool(ws);
        const [result] = await tool.execute({ path: '.', recursive: true }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('file1.txt');
        expect(result.result).toContain('subdir/file3.txt');
    });

    it('reports missing path', async () => {
        const tool = new ListDirectoryTool(ws);
        const [result] = await tool.execute({}) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('reports path not found', async () => {
        const tool = new ListDirectoryTool(ws);
        const [result] = await tool.execute({ path: 'nonexistent' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('reports error for path outside workspace', async () => {
        const tool = new ListDirectoryTool(ws);
        const [result] = await tool.execute({ path: '../outside' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('Invalid or inaccessible path');
    });
});

describe('ListDirectoryTool - edge cases', () => {
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

    it('reports error when path is a file', async () => {
        createTempFile(tmpDir, 'afile.txt', 'x');
        const tool = new ListDirectoryTool(ws);
        const [result] = await tool.execute({ path: 'afile.txt' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('not a directory');
    });

    it('lists an empty directory', async () => {
        mkdirSync(path.join(tmpDir, 'emptydir'));
        const tool = new ListDirectoryTool(ws);
        const [result] = await tool.execute({ path: 'emptydir' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('empty directory');
    });
});

describe('ListDirectoryTool - no config', () => {
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

    it('lists with default config using absolute path', async () => {
        const tool = new ListDirectoryTool(ws);
        const [result] = await tool.execute({ path: tmpDir }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
    });
});

describe('filesystem — ListDirectoryTool catch', () => {
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

    it('handles stat failure in list directory', async () => {
        vi.mocked(fsp.stat).mockRejectedValueOnce(new Error('stat failed'));
        const tool = new ListDirectoryTool(ws);
        const [result] = await tool.execute({ path: '.' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('stat failed');
    });

    it('handles readdir failure in non-recursive list', async () => {
        vi.mocked(fsp.readdir).mockRejectedValueOnce(new Error('readdir error'));
        const tool = new ListDirectoryTool(ws);
        const [result] = await tool.execute({ path: '.' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('Error listing directory');
    });
});

describe('ListDirectoryTool — thresholds (non-recursive)', () => {
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

    it('returns count summary when entries exceed maxDisplayEntries', async () => {
        for (let i = 0; i < 5; i++) {
            createTempFile(tmpDir, `file${i}.txt`, 'x');
        }
        const sc = new SearchConfiguration(50, 2, 20);
        const tool = new ListDirectoryTool(ws, sc);
        const [result] = await tool.execute({ path: '.' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toBe('Found 5 files and 0 directories');
    });

    it('returns error when entries reach maxTotalEntries', async () => {
        for (let i = 0; i < 5; i++) {
            createTempFile(tmpDir, `file${i}.txt`, 'x');
        }
        const sc = new SearchConfiguration(50, 10, 4);
        const tool = new ListDirectoryTool(ws, sc);
        const [result] = await tool.execute({ path: '.' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('too many entries');
    });

    it('lists paths when entries below maxDisplayEntries', async () => {
        for (let i = 0; i < 3; i++) {
            createTempFile(tmpDir, `file${i}.txt`, 'x');
        }
        const sc = new SearchConfiguration(50, 10, 20);
        const tool = new ListDirectoryTool(ws, sc);
        const [result] = await tool.execute({ path: '.' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('file0.txt');
        expect(result.result).toContain('file1.txt');
    });
});

describe('ListDirectoryTool — skipDirs in flat mode', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        tmpDir = createTempDir();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        removeTempDir(tmpDir);
    });

    it('skips directories listed in skipDirs in non-recursive listing', async () => {
        ws = new Workspace(
            new DirectoryConfiguration(
                [{ type: AccessType.Write, path: tmpDir }],
                ['node_modules', '.git'],
            )
        );
        createTempDirStructure(tmpDir, {
            'README.md': 'hello',
            'node_modules/pkg/index.js': '',
            '.git/config': '',
        });
        const tool = new ListDirectoryTool(ws);
        const [result] = await tool.execute({ path: '.' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('README.md');
        expect(result.result).not.toContain('node_modules');
        expect(result.result).not.toContain('.git');
    });

    it('does not filter when skipDirs is empty', async () => {
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        createTempDirStructure(tmpDir, {
            'README.md': 'hello',
            'node_modules/pkg/index.js': '',
        });
        const tool = new ListDirectoryTool(ws);
        const [result] = await tool.execute({ path: '.' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('README.md');
        expect(result.result).toContain('node_modules/');
    });

    it('still skips skipDirs in recursive mode', async () => {
        ws = new Workspace(
            new DirectoryConfiguration(
                [{ type: AccessType.Write, path: tmpDir }],
                ['node_modules'],
            )
        );
        createTempDirStructure(tmpDir, {
            'README.md': 'hello',
            'node_modules/pkg/index.js': '',
        });
        const tool = new ListDirectoryTool(ws);
        const [result] = await tool.execute({ path: '.', recursive: true }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('README.md');
        expect(result.result).not.toContain('node_modules');
    });
});

describe('ListDirectoryTool — thresholds (recursive)', () => {
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

    it('returns count summary when entries exceed maxDisplayEntries', async () => {
        for (let i = 0; i < 3; i++) {
            createTempFile(tmpDir, `f${i}.txt`, 'x');
        }
        createTempDirStructure(tmpDir, { 'sub/a.txt': 'x', 'sub/b.txt': 'x' });
        const sc = new SearchConfiguration(50, 3, 20);
        const tool = new ListDirectoryTool(ws, sc);
        const [result] = await tool.execute({ path: '.', recursive: true }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Found');
        expect(result.result).toContain('files');
        expect(result.result).toContain('directories');
    });

    it('returns error when entries reach maxTotalEntries', async () => {
        for (let i = 0; i < 5; i++) {
            createTempFile(tmpDir, `f${i}.txt`, 'x');
        }
        const sc = new SearchConfiguration(50, 10, 3);
        const tool = new ListDirectoryTool(ws, sc);
        const [result] = await tool.execute({ path: '.', recursive: true }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('too many entries');
    });

    it('lists paths when entries below maxDisplayEntries', async () => {
        for (let i = 0; i < 2; i++) {
            createTempFile(tmpDir, `f${i}.txt`, 'x');
        }
        const sc = new SearchConfiguration(50, 10, 20);
        const tool = new ListDirectoryTool(ws, sc);
        const [result] = await tool.execute({ path: '.', recursive: true }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('f0.txt');
        expect(result.result).toContain('f1.txt');
    });
});

describe('ListDirectoryTool — walk errors', () => {
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

    it('reports warning when a subdirectory cannot be read during recursive listing', async () => {
        createTempDirStructure(tmpDir, {
            'good.txt': 'data',
            'sub/f.txt': 'data',
        });
        const realReaddir = vi.mocked(fsp.readdir).getMockImplementation()!;
        vi.mocked(fsp.readdir)
            .mockImplementationOnce(realReaddir)
            .mockRejectedValueOnce(new Error('permission denied'));
        const tool = new ListDirectoryTool(ws);
        const [result] = await tool.execute({ path: '.', recursive: true }) as [ToolResult];
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
        const tool = new ListDirectoryTool(ws);
        const [result] = await tool.execute({ path: '.', recursive: true }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).not.toContain('Warning');
        expect(result.result).toContain('good.txt');
        expect(result.result).toContain('sub/f.txt');
    });

    it('includes walk error warning when maxTotalEntries reached with unreadable subdirs', async () => {
        const walkMock = vi.spyOn(ws, 'walk');
        const subDir = path.join(tmpDir, 'sub');
        walkMock.mockImplementation(async function* (dir: string, onError?: (p: string, e: Error) => void) {
            yield { filePath: path.join(tmpDir, 'f.txt'), dirent: { isDirectory: () => false, isFile: () => true, name: 'f.txt' } as any };
            yield { filePath: subDir, dirent: { isDirectory: () => true, isFile: () => false, name: 'sub' } as any };
            onError?.(subDir, new Error('permission denied'));
            for (let i = 0; i < 3; i++) {
                yield { filePath: path.join(tmpDir, `f${i}.txt`), dirent: { isDirectory: () => false, isFile: () => true, name: `f${i}.txt` } as any };
            }
        });
        const sc = new SearchConfiguration(50, 10, 5);
        const tool = new ListDirectoryTool(ws, sc);
        const [result] = await tool.execute({ path: '.', recursive: true }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('Warning');
        expect(result.result).toContain('could not read');
        expect(result.result).toContain('too many entries');
    });

    it('shows walk error warning in count summary when display limit exceeded', async () => {
        const walkMock = vi.spyOn(ws, 'walk');
        const subDir = path.join(tmpDir, 'sub');
        walkMock.mockImplementation(async function* (dir: string, onError?: (p: string, e: Error) => void) {
            yield { filePath: path.join(tmpDir, 'f.txt'), dirent: { isDirectory: () => false, isFile: () => true, name: 'f.txt' } as any };
            yield { filePath: subDir, dirent: { isDirectory: () => true, isFile: () => false, name: 'sub' } as any };
            onError?.(subDir, new Error('permission denied'));
            for (let i = 0; i < 3; i++) {
                yield { filePath: path.join(tmpDir, `f${i}.txt`), dirent: { isDirectory: () => false, isFile: () => true, name: `f${i}.txt` } as any };
            }
        });
        const sc = new SearchConfiguration(50, 3, 20);
        const tool = new ListDirectoryTool(ws, sc);
        const [result] = await tool.execute({ path: '.', recursive: true }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Warning');
        expect(result.result).toContain('could not read');
        expect(result.result).toContain('files');
        expect(result.result).toContain('directories');
    });

    it('shows plural walk error warning when maxTotalEntries reached with multiple unreadable subdirs', async () => {
        const walkMock = vi.spyOn(ws, 'walk');
        const subDir1 = path.join(tmpDir, 'sub1');
        const subDir2 = path.join(tmpDir, 'sub2');
        walkMock.mockImplementation(async function* (dir: string, onError?: (p: string, e: Error) => void) {
            yield { filePath: path.join(tmpDir, 'f.txt'), dirent: { isDirectory: () => false, isFile: () => true, name: 'f.txt' } as any };
            yield { filePath: subDir1, dirent: { isDirectory: () => true, isFile: () => false, name: 'sub1' } as any };
            onError?.(subDir1, new Error('err1'));
            yield { filePath: subDir2, dirent: { isDirectory: () => true, isFile: () => false, name: 'sub2' } as any };
            onError?.(subDir2, new Error('err2'));
            for (let i = 0; i < 3; i++) {
                yield { filePath: path.join(tmpDir, `f${i}.txt`), dirent: { isDirectory: () => false, isFile: () => true, name: `f${i}.txt` } as any };
            }
        });
        const sc = new SearchConfiguration(50, 10, 5);
        const tool = new ListDirectoryTool(ws, sc);
        const [result] = await tool.execute({ path: '.', recursive: true }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('Warning');
        expect(result.result).toContain('could not read 2 directories');
        expect(result.result).toContain('too many entries');
    });

    it('shows plural walk error warning in count summary when display limit exceeded', async () => {
        const walkMock = vi.spyOn(ws, 'walk');
        const subDir1 = path.join(tmpDir, 'sub1');
        const subDir2 = path.join(tmpDir, 'sub2');
        walkMock.mockImplementation(async function* (dir: string, onError?: (p: string, e: Error) => void) {
            yield { filePath: path.join(tmpDir, 'f.txt'), dirent: { isDirectory: () => false, isFile: () => true, name: 'f.txt' } as any };
            yield { filePath: subDir1, dirent: { isDirectory: () => true, isFile: () => false, name: 'sub1' } as any };
            onError?.(subDir1, new Error('err1'));
            yield { filePath: subDir2, dirent: { isDirectory: () => true, isFile: () => false, name: 'sub2' } as any };
            onError?.(subDir2, new Error('err2'));
            for (let i = 0; i < 3; i++) {
                yield { filePath: path.join(tmpDir, `f${i}.txt`), dirent: { isDirectory: () => false, isFile: () => true, name: `f${i}.txt` } as any };
            }
        });
        const sc = new SearchConfiguration(50, 3, 20);
        const tool = new ListDirectoryTool(ws, sc);
        const [result] = await tool.execute({ path: '.', recursive: true }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Warning');
        expect(result.result).toContain('could not read 2 directories');
        expect(result.result).toContain('files');
        expect(result.result).toContain('directories');
    });
});
