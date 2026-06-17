import type { ToolResult } from '@johannes.latzel/llm-chat';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileToolPackage } from '../../src/index.js';
import { Workspace } from '../../src/lib/workspace.js';
import { AccessType } from '../../src/lib/types.js';
import { DirectoryConfiguration, FileConfiguration } from '../../src/lib/config.js';
import { createTempDir, removeTempDir } from '../index.js';

describe('FileToolPackage', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = createTempDir();
    });

    afterEach(() => {
        removeTempDir(tmpDir);
    });

    it('returns all 13 file tools', () => {
        const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        const pkg = new FileToolPackage(ws);
        const tools = pkg.tools();
        expect(tools).toHaveLength(13);
        const names = tools.map((t) => t.name).sort();
        expect(names).toEqual([
            'create_folder',
            'delete_file',
            'entry_info',
            'file_access_info',
            'insert_file_content',
            'list_directory',
            'move_file',
            'read_file',
            'replace_file_content',
            'replace_file_lines',
            'search_entries',
            'switch_workspace',
            'write_file',
        ]);
    });

    it('all tools execute without error', async () => {
        const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        const pkg = new FileToolPackage(ws);
        for (const tool of pkg.tools()) {
            const [result] = await tool.execute({}) as [ToolResult];
            // Each tool should either succeed or return a specific error
            // (e.g. list_directory requires a path, read_file requires a path)
            expect(result).toHaveProperty('status');
            expect(result).toHaveProperty('result');
        }
    });

    it('returns tutorial with path resolution guidance', () => {
        const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        const pkg = new FileToolPackage(ws);
        const tutorial = pkg.tutorial();
        expect(tutorial).toBeTypeOf('string');
        expect(tutorial).toContain('Path resolution');
        expect(tutorial).toContain('filesystem root');
        expect(tutorial).toContain('workspace root');
    });

    it('includes read-before-write in tutorial when enabled', () => {
        const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        const pkg = new FileToolPackage(ws, undefined, new FileConfiguration(undefined, undefined, true));
        const tutorial = pkg.tutorial();
        expect(tutorial).toContain('Read before write');
    });

    it('omits read-before-write from tutorial when disabled', () => {
        const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        const pkg = new FileToolPackage(ws, undefined, new FileConfiguration(undefined, undefined, false));
        const tutorial = pkg.tutorial();
        expect(tutorial).not.toContain('Read before write');
    });

    it('all tools can be called by name from the package', () => {
        const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: tmpDir }]));
        const pkg = new FileToolPackage(ws);
        const tools = pkg.tools();
        const toolMap = new Map(tools.map((t) => [t.name, t]));
        expect(toolMap.has('read_file')).toBe(true);
        expect(toolMap.has('write_file')).toBe(true);
        expect(toolMap.has('search_entries')).toBe(true);
        expect(toolMap.has('list_directory')).toBe(true);
        expect(toolMap.has('entry_info')).toBe(true);
        expect(toolMap.has('create_folder')).toBe(true);
        expect(toolMap.has('delete_file')).toBe(true);
        expect(toolMap.has('move_file')).toBe(true);
        expect(toolMap.has('file_access_info')).toBe(true);
        expect(toolMap.has('switch_workspace')).toBe(true);
        expect(toolMap.has('insert_file_content')).toBe(true);
        expect(toolMap.has('replace_file_content')).toBe(true);
        expect(toolMap.has('replace_file_lines')).toBe(true);
    });
});
