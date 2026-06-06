import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ResultStatus } from '@johannes.latzel/llm-chat';
import { SwitchWorkspaceTool } from '../../src/index.js';
import { Workspace } from '../../src/lib/workspace.js';
import { AccessType } from '../../src/lib/types.js';
import { DirectoryConfiguration } from '../../src/lib/config.js';
import { createTempDir, removeTempDir, createTempDirStructure } from '../index.js';

describe('SwitchWorkspaceTool', () => {
    let tmpDir: string;
    let ws: Workspace;

    beforeEach(() => {
        tmpDir = createTempDir();
        ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        createTempDirStructure(tmpDir, {
            'subdir/file.txt': 'test',
        });
    });

    afterEach(() => {
        removeTempDir(tmpDir);
    });

    it('switches to a valid subdirectory', async () => {
        const subdir = path.join(tmpDir, 'subdir');
        const tool = new SwitchWorkspaceTool(ws);
        const result = await tool.execute({ path: subdir });
        expect(result.status).toBe(ResultStatus.Success);
        expect(result.result).toContain('Switched workspace to:');
    });

    it('reports error for non-string path', async () => {
        const tool = new SwitchWorkspaceTool(ws);
        const result = await tool.execute({ path: 123 });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('path must be a non-empty string');
    });

    it('reports error for empty path', async () => {
        const tool = new SwitchWorkspaceTool(ws);
        const result = await tool.execute({ path: '   ' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('path must be a non-empty string');
    });

    it('reports error for path outside workspace', async () => {
        const tool = new SwitchWorkspaceTool(ws);
        const result = await tool.execute({ path: '/etc' });
        expect(result.status).toBe(ResultStatus.Error);
        expect(result.result).toContain('not within any configured directory');
    });
});
