import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResultStatus, type ToolResult } from '@johannes.latzel/llm-chat';
import * as fsp from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DeleteFileTool } from '../../src/index.js';
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
        rm: vi.fn(mod.rm),
        rmdir: vi.fn(mod.rmdir),
    };
});

describe('DeleteFileTool', () => {
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

    it('declares recursive as boolean in its input schema', () => {
        const tool = new DeleteFileTool(ws);
        const parameters = tool.toOpenAI().function.parameters as unknown as {
            properties: Record<string, { type: string }>;
        };
        expect(parameters.properties.recursive.type).toBe('boolean');
    });

    it('deletes a file', async () => {
        createTempFile(tmpDir, 'file.txt', 'content');
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({ paths: ['file.txt'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Deleted file');
    });

    it('deletes multiple files', async () => {
        createTempFile(tmpDir, 'a.txt', 'a');
        createTempFile(tmpDir, 'b.txt', 'b');
        const tool = new DeleteFileTool(ws);
        const results = await tool.execute({ paths: ['a.txt', 'b.txt'] }) as ToolResult[];
        expect(results).toHaveLength(2);
        expect(results[0].status).toBe(ResultStatus.Success);
        expect(results[1].status).toBe(ResultStatus.Success);
    });

    it('deletes an empty directory', async () => {
        await fsp.mkdir(path.join(tmpDir, 'emptydir'), { recursive: true });
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({ paths: ['emptydir'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Deleted directory');
    });

    it('deletes non-empty directory with recursive flag', async () => {
        await fsp.mkdir(path.join(tmpDir, 'subdir'), { recursive: true });
        createTempFile(tmpDir, 'subdir/file.txt', 'content');
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({ paths: ['subdir'], recursive: true }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Deleted directory');
    });

    it('deletes a deeply nested tree with recursive flag', async () => {
        createTempFile(tmpDir, 'deep/a/b/c/leaf.txt', 'leaf');
        createTempFile(tmpDir, 'deep/a/mid.txt', 'mid');
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({ paths: ['deep'], recursive: true }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Deleted directory');
        expect(existsSync(path.join(tmpDir, 'deep'))).toBe(false);
    });

    it('deletes recursively when the tree contains only empty subdirectories', async () => {
        await fsp.mkdir(path.join(tmpDir, 'tree/empty-one'), { recursive: true });
        await fsp.mkdir(path.join(tmpDir, 'tree/empty-two/nested-empty'), { recursive: true });
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({ paths: ['tree'], recursive: true }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Deleted directory');
        expect(existsSync(path.join(tmpDir, 'tree'))).toBe(false);
    });

    it('removes symlinks but keeps their targets outside the deleted tree', async () => {
        createTempFile(tmpDir, 'outside/keep.txt', 'keep');
        await fsp.mkdir(path.join(tmpDir, 'tree'), { recursive: true });
        await fsp.symlink(
            path.join(tmpDir, 'outside'),
            path.join(tmpDir, 'tree', 'link'),
            'dir'
        );
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({ paths: ['tree'], recursive: true }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(existsSync(path.join(tmpDir, 'tree'))).toBe(false);
        expect(existsSync(path.join(tmpDir, 'outside', 'keep.txt'))).toBe(true);
    });

    it('rejects non-empty directory without recursive flag with actionable message', async () => {
        await fsp.mkdir(path.join(tmpDir, 'subdir'), { recursive: true });
        createTempFile(tmpDir, 'subdir/file.txt', 'content');
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({ paths: ['subdir'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('Directory not empty');
        expect(result.result).toContain(path.join(tmpDir, 'subdir'));
        expect(result.result).toContain('recursive=true');
        expect(result.result).not.toContain('ENOTEMPTY');
    });

    it('treats string "true" as absent flag (strict boolean semantics)', async () => {
        await fsp.mkdir(path.join(tmpDir, 'subdir'), { recursive: true });
        createTempFile(tmpDir, 'subdir/file.txt', 'content');
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({
            paths: ['subdir'],
            recursive: 'true'
        }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('recursive=true');
        expect(existsSync(path.join(tmpDir, 'subdir'))).toBe(true);
    });

    it('reports missing paths', async () => {
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({}) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('rejects non-array paths', async () => {
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({ paths: 'not-an-array' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('must be an array');
    });

    it('rejects empty paths array', async () => {
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({ paths: [] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('non-empty');
    });

    it('rejects empty string in paths', async () => {
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({ paths: [''] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('non-empty string');
    });

    it('rejects non-string element in paths', async () => {
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({ paths: [42] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('non-empty string');
    });

    it('rejects path outside workspace', async () => {
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({ paths: ['/etc/passwd'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
    });

    it('rejects non-existent path', async () => {
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({ paths: ['nonexistent.txt'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('does not exist');
    });

    it('partially fails when one path is invalid', async () => {
        createTempFile(tmpDir, 'exists.txt', 'content');
        const tool = new DeleteFileTool(ws);
        const results = await tool.execute({ paths: ['exists.txt', '/etc/passwd', 'nonexistent'] }) as ToolResult[];
        expect(results).toHaveLength(3);
        expect(results[0].status).toBe(ResultStatus.Success);
        expect(results[1].status).toBe(ResultStatus.Error);
        expect(results[2].status).toBe(ResultStatus.Error);
    });

    it('surfaces offending nested path when recursive removal fails', async () => {
        createTempFile(tmpDir, 'deep/a/b/c/locked.txt', 'locked');
        vi.mocked(fsp.rm).mockRejectedValueOnce(
            new Error(`EACCES: permission denied, unlink '${path.join(tmpDir, 'deep/a/b/c/locked.txt')}'`)
        );
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({ paths: ['deep'], recursive: true }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('Error deleting directory');
        expect(result.result).toContain('permission denied');
        expect(result.result).toContain(path.join(tmpDir, 'deep/a/b/c/locked.txt'));
    });
});

describe('DeleteFileTool - no config', () => {
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

    it('deletes a file with default config using absolute path', async () => {
        createTempFile(tmpDir, 'target.txt', 'data');
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({ paths: [path.join(tmpDir, 'target.txt')] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Deleted file');
    });
});

describe('filesystem, DeleteFileTool catch', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        createTempFile(tmpDir, 'file.txt', 'content');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        removeTempDir(tmpDir);
    });

    it('handles rm failure', async () => {
        vi.mocked(fsp.rm).mockRejectedValueOnce(new Error('rm failed'));
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({ paths: ['file.txt'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('rm failed');
    });

    it('handles rmdir failure', async () => {
        await fsp.mkdir(path.join(tmpDir, 'emptydir'), { recursive: true });
        vi.mocked(fsp.rmdir).mockRejectedValueOnce(new Error('rmdir failed'));
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({ paths: ['emptydir'] }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('rmdir failed');
    });

    it('falls back to generic error when ENOTEMPTY occurs despite recursive flag', async () => {
        await fsp.mkdir(path.join(tmpDir, 'subdir'), { recursive: true });
        vi.mocked(fsp.rm).mockRejectedValueOnce(
            Object.assign(new Error('ENOTEMPTY: directory not empty, rmdir contested'), {
                code: 'ENOTEMPTY'
            })
        );
        const tool = new DeleteFileTool(ws);
        const [result] = await tool.execute({ paths: ['subdir'], recursive: true }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('Error deleting directory');
        expect(result.result).toContain('contested');
        expect(result.result).not.toContain('Directory not empty:');
    });
});
