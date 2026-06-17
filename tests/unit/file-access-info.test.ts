import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ResultStatus, type ToolResult } from '@johannes.latzel/llm-chat';
import { FileAccessInfoTool } from '../../src/index.js';
import { Workspace } from '../../src/lib/workspace.js';
import { AccessType } from '../../src/lib/types.js';
import { DirectoryConfiguration } from '../../src/lib/config.js';
import { createTempDir, removeTempDir } from '../index.js';

describe('FileAccessInfoTool', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = createTempDir();
    });

    afterEach(() => {
        removeTempDir(tmpDir);
    });

    it('reports a single write directory as current workspace', async () => {
        const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        const tool = new FileAccessInfoTool(ws);
        const [result] = await tool.execute({}) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain(tmpDir);
        expect(result.result).toContain('write');
        expect(result.result).toContain('current workspace');
    });

    it('reports read and write directories with correct labels', async () => {
        const subDir = path.join(tmpDir, 'sub');
        const ws = new Workspace(
            new DirectoryConfiguration(
                [
                    { type: AccessType.Write, path: tmpDir },
                    { type: AccessType.Read, path: subDir },
                ],
            )
        );
        const tool = new FileAccessInfoTool(ws);
        const [result] = await tool.execute({}) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain(tmpDir);
        expect(result.result).toContain('write');
        expect(result.result).toContain(subDir);
        expect(result.result).toContain('read');
    });

    it('marks only the current workspace path', async () => {
        const dirA = path.join(tmpDir, 'a');
        const dirB = path.join(tmpDir, 'b');
        const ws = new Workspace(
            new DirectoryConfiguration(
                [
                    { type: AccessType.Write, path: dirA },
                    { type: AccessType.Read, path: dirB },
                ],
            )
        );
        const tool = new FileAccessInfoTool(ws);
        const [result] = await tool.execute({}) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        const lines = (result.result as string).split('\n');
        const marked = lines.filter((l) => l.includes('current workspace'));
        expect(marked).toHaveLength(1);
        expect(marked[0]).toContain(dirA);
    });

    it('handles empty args gracefully', async () => {
        const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        const tool = new FileAccessInfoTool(ws);
        const [result] = await tool.execute({ path: 'unexpected_arg' }) as [ToolResult];
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain(tmpDir);
    });
});
