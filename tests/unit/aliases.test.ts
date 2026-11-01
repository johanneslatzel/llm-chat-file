import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ResultStatus } from '@johannes.latzel/llm-chat';
import {
    CreateFolderTool,
    DeleteFileTool,
    EntryInfoTool,
    ReadFileTool,
    ReplaceFileContentTool
} from '../../src/index.js';
import { AccessType, DirectoryConfiguration, Workspace } from '@johannes.latzel/llm-chat-workspace';
import { createTempDir, createTempFile, removeTempDir } from '../index.js';

describe('hidden path aliases', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
    });

    afterEach(() => {
        removeTempDir(tmpDir);
    });

    function tools(): (
        | ReadFileTool
        | DeleteFileTool
        | EntryInfoTool
        | CreateFolderTool
        | ReplaceFileContentTool
    )[] {
        return [
            new ReadFileTool(ws),
            new DeleteFileTool(ws),
            new EntryInfoTool(ws),
            new CreateFolderTool(ws),
            new ReplaceFileContentTool(ws)
        ];
    }

    it('does not expose path in the five tool schemas', () => {
        for (const tool of tools()) {
            const parameters = tool.toOpenAI().function.parameters as {
                properties: Record<string, unknown>;
                required?: string[];
            };
            expect(parameters.properties.paths).toBeDefined();
            expect(parameters.properties.path).toBeUndefined();
            expect(parameters.required).toContain('paths');
        }
    });

    it('reads a file when path is supplied instead of paths', async () => {
        createTempFile(tmpDir, 'hello.txt', 'Hello, world!');
        const [result] = await new ReadFileTool(ws).execute({ path: 'hello.txt' });
        expect(result!.status).toBe(ResultStatus.Success);
        expect(result!.result).toContain('Hello, world!');
    });

    it('deletes a file when path is supplied instead of paths', async () => {
        createTempFile(tmpDir, 'gone.txt', 'bye');
        const [result] = await new DeleteFileTool(ws).execute({ path: 'gone.txt' });
        expect(result!.status).toBe(ResultStatus.Success);
        expect(existsSync(path.join(tmpDir, 'gone.txt'))).toBe(false);
    });

    it('reports entry info when path is supplied instead of paths', async () => {
        createTempFile(tmpDir, 'info.txt', 'info');
        const [result] = await new EntryInfoTool(ws).execute({ path: 'info.txt' });
        expect(result!.status).toBe(ResultStatus.Success);
        expect(result!.result).toContain('Type: file');
    });

    it('creates a folder when path is supplied instead of paths', async () => {
        const [result] = await new CreateFolderTool(ws).execute({ path: 'newdir' });
        expect(result!.status).toBe(ResultStatus.Success);
        expect(existsSync(path.join(tmpDir, 'newdir'))).toBe(true);
    });

    it('replaces content when path is supplied instead of paths', async () => {
        createTempFile(tmpDir, 'replace.txt', 'hello world');
        const [result] = await new ReplaceFileContentTool(ws).execute({
            path: 'replace.txt',
            old_content: 'hello',
            new_content: 'bye'
        });
        expect(result!.status).toBe(ResultStatus.Success);
        expect(readFileSync(path.join(tmpDir, 'replace.txt'), 'utf-8')).toBe('bye world');
    });
});
