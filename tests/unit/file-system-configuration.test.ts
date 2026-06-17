import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'node:path';
import { symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { SearchConfiguration, FileConfiguration, DirectoryConfiguration } from '../../src/lib/config.js';
import { Workspace } from '../../src/lib/workspace.js';
import { AccessType } from '../../src/lib/types.js';
import { withTempDir } from '../helper/temp-fs.js';

describe('SearchConfiguration', () => {
    afterEach(() => {
        delete process.env.LLM_CHAT_FS_MAX_SEARCH_RESULTS;
        delete process.env.LLM_CHAT_FS_MAX_DISPLAY_ENTRIES;
        delete process.env.LLM_CHAT_FS_MAX_TOTAL_ENTRIES;
    });

    it('defaults maxSearchResults to 50', () => {
        const sc = new SearchConfiguration();
        expect(sc.maxSearchResults).toBe(50);
    });

    it('reads maxSearchResults from env', () => {
        process.env.LLM_CHAT_FS_MAX_SEARCH_RESULTS = '100';
        const sc = new SearchConfiguration();
        expect(sc.maxSearchResults).toBe(100);
    });

    it('prefers explicit value over env', () => {
        process.env.LLM_CHAT_FS_MAX_SEARCH_RESULTS = '100';
        const sc = new SearchConfiguration(25);
        expect(sc.maxSearchResults).toBe(25);
    });

    it('defaults maxDisplayEntries to 200', () => {
        const sc = new SearchConfiguration();
        expect(sc.maxDisplayEntries).toBe(200);
    });

    it('reads maxDisplayEntries from env', () => {
        process.env.LLM_CHAT_FS_MAX_DISPLAY_ENTRIES = '50';
        const sc = new SearchConfiguration();
        expect(sc.maxDisplayEntries).toBe(50);
    });

    it('prefers explicit maxDisplayEntries over env', () => {
        process.env.LLM_CHAT_FS_MAX_DISPLAY_ENTRIES = '50';
        const sc = new SearchConfiguration(undefined, 10);
        expect(sc.maxDisplayEntries).toBe(10);
    });

    it('defaults maxTotalEntries to 5000', () => {
        const sc = new SearchConfiguration();
        expect(sc.maxTotalEntries).toBe(5000);
    });

    it('reads maxTotalEntries from env', () => {
        process.env.LLM_CHAT_FS_MAX_TOTAL_ENTRIES = '1000';
        const sc = new SearchConfiguration();
        expect(sc.maxTotalEntries).toBe(1000);
    });

    it('prefers explicit maxTotalEntries over env', () => {
        process.env.LLM_CHAT_FS_MAX_TOTAL_ENTRIES = '1000';
        const sc = new SearchConfiguration(undefined, undefined, 500);
        expect(sc.maxTotalEntries).toBe(500);
    });

    it('accepts all three positional params', () => {
        const sc = new SearchConfiguration(10, 50, 200);
        expect(sc.maxSearchResults).toBe(10);
        expect(sc.maxDisplayEntries).toBe(50);
        expect(sc.maxTotalEntries).toBe(200);
    });

    it('clamps maxSearchResults to min 1 when env is 0', () => {
        process.env.LLM_CHAT_FS_MAX_SEARCH_RESULTS = '0';
        const sc = new SearchConfiguration();
        expect(sc.maxSearchResults).toBe(1);
    });

    it('clamps maxDisplayEntries to min 1 when env is 0', () => {
        process.env.LLM_CHAT_FS_MAX_DISPLAY_ENTRIES = '0';
        const sc = new SearchConfiguration();
        expect(sc.maxDisplayEntries).toBe(1);
    });

    it('clamps maxTotalEntries to min 1 when env is 0', () => {
        process.env.LLM_CHAT_FS_MAX_TOTAL_ENTRIES = '0';
        const sc = new SearchConfiguration();
        expect(sc.maxTotalEntries).toBe(1);
    });

    it('clamps negative env values to min 1', () => {
        process.env.LLM_CHAT_FS_MAX_SEARCH_RESULTS = '-5';
        const sc = new SearchConfiguration();
        expect(sc.maxSearchResults).toBe(1);
    });

    it('falls back to default when env var is non-numeric', () => {
        process.env.LLM_CHAT_FS_MAX_SEARCH_RESULTS = 'not-a-number';
        const sc = new SearchConfiguration();
        expect(sc.maxSearchResults).toBe(50);
    });
});

describe('FileConfiguration', () => {
    it('defaults maxCharsPerFile to 10000', () => {
        const fc = new FileConfiguration();
        expect(fc.maxCharsPerFile).toBe(10000);
    });

    it('reads maxCharsPerFile from env', () => {
        process.env.LLM_CHAT_FS_MAX_CHARS_PER_FILE = '5000';
        const fc = new FileConfiguration();
        expect(fc.maxCharsPerFile).toBe(5000);
        delete process.env.LLM_CHAT_FS_MAX_CHARS_PER_FILE;
    });

    it('prefers explicit value over env', () => {
        process.env.LLM_CHAT_FS_MAX_CHARS_PER_FILE = '5000';
        const fc = new FileConfiguration(100);
        expect(fc.maxCharsPerFile).toBe(100);
        delete process.env.LLM_CHAT_FS_MAX_CHARS_PER_FILE;
    });

    it('clamps maxCharsPerFile to min 1 when env is 0', () => {
        process.env.LLM_CHAT_FS_MAX_CHARS_PER_FILE = '0';
        const fc = new FileConfiguration();
        expect(fc.maxCharsPerFile).toBe(1);
        delete process.env.LLM_CHAT_FS_MAX_CHARS_PER_FILE;
    });

    it('clamps negative maxCharsPerFile env to min 1', () => {
        process.env.LLM_CHAT_FS_MAX_CHARS_PER_FILE = '-10';
        const fc = new FileConfiguration();
        expect(fc.maxCharsPerFile).toBe(1);
        delete process.env.LLM_CHAT_FS_MAX_CHARS_PER_FILE;
    });

    it('falls back to default when maxCharsPerFile env is non-numeric', () => {
        process.env.LLM_CHAT_FS_MAX_CHARS_PER_FILE = 'abc';
        const fc = new FileConfiguration();
        expect(fc.maxCharsPerFile).toBe(10000);
        delete process.env.LLM_CHAT_FS_MAX_CHARS_PER_FILE;
    });

    it('defaults maxFileSize to 10MB', () => {
        const fc = new FileConfiguration();
        expect(fc.maxFileSize).toBe(10 * 1024 * 1024);
    });

    it('reads maxFileSize from env', () => {
        process.env.LLM_CHAT_FS_MAX_FILE_SIZE = '5000';
        const fc = new FileConfiguration();
        expect(fc.maxFileSize).toBe(5000);
        delete process.env.LLM_CHAT_FS_MAX_FILE_SIZE;
    });

    it('prefers explicit maxFileSize over env', () => {
        process.env.LLM_CHAT_FS_MAX_FILE_SIZE = '999';
        const fc2 = new FileConfiguration(undefined, 100);
        expect(fc2.maxFileSize).toBe(100);
        delete process.env.LLM_CHAT_FS_MAX_FILE_SIZE;
    });

    it('clamps maxFileSize to min 1 when env is 0', () => {
        process.env.LLM_CHAT_FS_MAX_FILE_SIZE = '0';
        const fc = new FileConfiguration();
        expect(fc.maxFileSize).toBe(1);
        delete process.env.LLM_CHAT_FS_MAX_FILE_SIZE;
    });
});

describe('DirectoryConfiguration.deduplicate', () => {
    it('removes read access when write access exists for the same path', () => {
        const result = new DirectoryConfiguration(
            [
                { type: AccessType.Read, path: '/tmp' },
                { type: AccessType.Write, path: '/tmp' },
            ],
        ).deduplicate();
        expect(result.accesses).toHaveLength(1);
        expect(result.accesses[0]!.type).toBe(AccessType.Write);
        expect(result.accesses[0]!.path).toBe(path.resolve('/tmp'));
    });

    it('removes duplicate read entries', () => {
        const result = new DirectoryConfiguration(
            [
                { type: AccessType.Read, path: '/tmp' },
                { type: AccessType.Read, path: '/tmp' },
            ],
        ).deduplicate();
        expect(result.accesses).toHaveLength(1);
        expect(result.accesses[0]!.type).toBe(AccessType.Read);
        expect(result.accesses[0]!.path).toBe(path.resolve('/tmp'));
    });

    it('removes duplicate write entries', () => {
        const result = new DirectoryConfiguration(
            [
                { type: AccessType.Write, path: '/tmp' },
                { type: AccessType.Write, path: '/tmp' },
            ],
        ).deduplicate();
        expect(result.accesses).toHaveLength(1);
        expect(result.accesses[0]!.type).toBe(AccessType.Write);
        expect(result.accesses[0]!.path).toBe(path.resolve('/tmp'));
    });

    it('keeps distinct paths separate', () => {
        const result = new DirectoryConfiguration(
            [
                { type: AccessType.Read, path: '/var/log' },
                { type: AccessType.Write, path: '/tmp' },
            ],
        ).deduplicate();
        expect(result.accesses).toHaveLength(2);
    });

    it('returns empty for empty input', () => {
        const result = new DirectoryConfiguration([]).deduplicate();
        expect(result.accesses).toHaveLength(0);
    });

    it('write overrides read for same path regardless of order', () => {
        const result = new DirectoryConfiguration(
            [
                { type: AccessType.Write, path: '/tmp' },
                { type: AccessType.Read, path: '/tmp' },
            ],
        ).deduplicate();
        expect(result.accesses).toHaveLength(1);
        expect(result.accesses[0]!.type).toBe(AccessType.Write);
    });
});

describe('Workspace', () => {
    it('throws when accesses is empty', () => {
        expect(() => new Workspace(new DirectoryConfiguration([]))).toThrow('At least one access directory');
    });

    it('sets currentPath to write directory', () => {
        const ws = new Workspace(new DirectoryConfiguration(
            [
                { type: AccessType.Read, path: '/var/log' },
                { type: AccessType.Write, path: '/home/project' },
            ],
        ));
        expect(ws.currentPath).toBe('/home/project');
    });

    it('uses workspacePath when set, even if other write dirs exist', () => {
        const ws = new Workspace(new DirectoryConfiguration(
            [
                { type: AccessType.Write, path: '/some/output' },
                { type: AccessType.Read, path: '/var/log' },
            ],
            undefined,
            undefined,
            '/workspace',
        ));
        expect(ws.currentPath).toBe('/workspace');
    });

    it('falls back to first write dir when no workspacePath', () => {
        const ws = new Workspace(new DirectoryConfiguration(
            [
                { type: AccessType.Write, path: '/home/project' },
                { type: AccessType.Write, path: '/home/other' },
            ],
        ));
        expect(ws.currentPath).toBe('/home/project');
    });

    it('falls back to read directory when no write access', () => {
        const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Read, path: '/var/log' }])
        );
        expect(ws.currentPath).toBe('/var/log');
    });

    it('canRead returns true for write directory', () => {
        const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: '/tmp' }])
        );
        expect(ws.canRead('/tmp')).toBe(true);
        expect(ws.canRead('/tmp/subdir')).toBe(true);
    });

    it('canRead returns false for path outside accesses', () => {
        const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: '/tmp' }])
        );
        expect(ws.canRead('/etc')).toBe(false);
    });

    it('canWrite returns true for write directory', () => {
        const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: '/tmp' }])
        );
        expect(ws.canWrite('/tmp')).toBe(true);
    });

    it('canWrite returns false for read-only directory', () => {
        const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Read, path: '/tmp' }])
        );
        expect(ws.canWrite('/tmp')).toBe(false);
    });

    it('normalize resolves relative path to currentPath', () => {
        const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: '/home/project' }])
        );
        expect(ws.normalize('src/file.ts')).toBe('/home/project/src/file.ts');
    });

    it('normalize resolves absolute path as-is', () => {
        const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: '/home/project' }])
        );
        expect(ws.normalize('/etc/passwd')).toBe('/etc/passwd');
    });

    it('switchWorkspace to valid subdirectory', async () => {
        const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: '/tmp' }])
        );
        await ws.switchWorkspace('/tmp/subdir');
        expect(ws.currentPath).toBe('/tmp/subdir');
    });

    it('switchWorkspace rejects path outside accesses', async () => {
        const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: '/tmp' }])
        );
        await expect(ws.switchWorkspace('/etc')).rejects.toThrow('not within any configured directory');
    });

    it('deduplicates overlapping read+write accesses from constructor', () => {
        const ws = new Workspace(new DirectoryConfiguration(
            [
                { type: AccessType.Read, path: '/tmp' },
                { type: AccessType.Write, path: '/tmp' },
            ],
        ));
        expect(ws.canRead('/tmp')).toBe(true);
        expect(ws.canWrite('/tmp')).toBe(true);
    });

    it('canRead returns true for both read and write directories', () => {
        const ws = new Workspace(new DirectoryConfiguration(
            [
                { type: AccessType.Read, path: '/var/log' },
                { type: AccessType.Write, path: '/tmp' },
            ],
        ));
        expect(ws.canRead('/var/log')).toBe(true);
        expect(ws.canRead('/var/log/syslog')).toBe(true);
        expect(ws.canRead('/tmp')).toBe(true);
        expect(ws.canRead('/etc')).toBe(false);
    });

});

describe('Workspace.walk', () => {
    it('returns no entries for unreadable path', async () => {
        await withTempDir(async (dir) => {
            const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Write, path: dir }]));
            const outside = path.resolve(dir, '..', 'outside');
            const entries: Array<{ filePath: string; dirent: import('node:fs').Dirent }> = [];
            for await (const entry of ws.walk(outside)) {
                entries.push(entry);
            }
            expect(entries).toHaveLength(0);
        });
    });

    it('yields file entries and skips symlinks', async () => {
        await withTempDir(async (dir) => {
            const allowed = path.join(dir, 'allowed');
            mkdirSync(allowed, { recursive: true });
            writeFileSync(path.join(allowed, 'file.txt'), 'hello');
            symlinkSync('/nonexistent', path.join(allowed, 'broken-link'));

            const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Read, path: allowed }]));
            const entries: Array<{ filePath: string; dirent: import('node:fs').Dirent }> = [];
            for await (const entry of ws.walk(allowed)) {
                entries.push(entry);
            }
            expect(entries).toHaveLength(1);
            expect(entries[0]!.dirent.isFile()).toBe(true);
            expect(entries[0]!.filePath).toContain('file.txt');
        });
    });

    it('yields directory entries and recurses', async () => {
        await withTempDir(async (dir) => {
            const allowed = path.join(dir, 'allowed');
            mkdirSync(allowed, { recursive: true });
            mkdirSync(path.join(allowed, 'subdir'), { recursive: true });
            writeFileSync(path.join(allowed, 'subdir', 'nested.txt'), 'data');

            const ws = new Workspace(new DirectoryConfiguration([{ type: AccessType.Read, path: allowed }]));
            const entries: Array<{ filePath: string; dirent: import('node:fs').Dirent }> = [];
            for await (const entry of ws.walk(allowed)) {
                entries.push(entry);
            }
            const filePaths = entries.map((e) => e.filePath);
            expect(filePaths).toContain(path.join(allowed, 'subdir'));
            expect(filePaths).toContain(path.join(allowed, 'subdir', 'nested.txt'));
        });
    });
});

describe('Workspace — resolveSymlinks', () => {
    it('when false, follows symlinks to outside paths (default behavior)', async () => {
        await withTempDir(async (dir) => {
            const allowedDir = path.join(dir, 'allowed');
            const secretDir = path.join(dir, 'secret');
            const linkPath = path.join(allowedDir, 'to-secret');

            mkdirSync(allowedDir, { recursive: true });
            mkdirSync(secretDir, { recursive: true });
            writeFileSync(path.join(secretDir, 'file.txt'), 'secret');
            symlinkSync(secretDir, linkPath);

            const ws = new Workspace(
                new DirectoryConfiguration([{ type: AccessType.Read, path: allowedDir }])
            );
            expect(ws.resolveSymlinks).toBe(false);
            expect(ws.canRead(linkPath)).toBe(true);
        });
    });

    it('when true, blocks symlinks to outside paths', async () => {
        await withTempDir(async (dir) => {
            const allowedDir = path.join(dir, 'allowed');
            const secretDir = path.join(dir, 'secret');
            const linkPath = path.join(allowedDir, 'to-secret');

            mkdirSync(allowedDir, { recursive: true });
            mkdirSync(secretDir, { recursive: true });
            writeFileSync(path.join(secretDir, 'file.txt'), 'secret');
            symlinkSync(secretDir, linkPath);

            const ws = new Workspace(
                new DirectoryConfiguration(
                    [{ type: AccessType.Read, path: allowedDir }],
                    undefined,
                    true,
                )
            );
            expect(ws.resolveSymlinks).toBe(true);
            expect(ws.canRead(linkPath)).toBe(false);
        });
    });

    it('when true, allows symlinks to paths within allowed dirs', async () => {
        await withTempDir(async (dir) => {
            const allowedDir = path.join(dir, 'allowed');
            const subDir = path.join(allowedDir, 'sub');
            const linkPath = path.join(allowedDir, 'link-to-sub');

            mkdirSync(allowedDir, { recursive: true });
            mkdirSync(subDir, { recursive: true });
            writeFileSync(path.join(subDir, 'file.txt'), 'hello');
            symlinkSync(subDir, linkPath);

            const ws = new Workspace(
                new DirectoryConfiguration(
                    [{ type: AccessType.Read, path: allowedDir }],
                    undefined,
                    true,
                )
            );
            expect(ws.canRead(linkPath)).toBe(true);
        });
    });

    it('when true, allows read of files inside allowed dirs', async () => {
        await withTempDir(async (dir) => {
            const allowedDir = path.join(dir, 'allowed');
            mkdirSync(allowedDir, { recursive: true });
            writeFileSync(path.join(allowedDir, 'file.txt'), 'hello');

            const ws = new Workspace(
                new DirectoryConfiguration(
                    [{ type: AccessType.Read, path: allowedDir }],
                    undefined,
                    true,
                )
            );
            expect(ws.canRead(path.join(allowedDir, 'file.txt'))).toBe(true);
        });
    });

    it('falls back to abs path when realpathSync.native fails', async () => {
        await withTempDir(async (dir) => {
            const ws = new Workspace(
                new DirectoryConfiguration(
                    [{ type: AccessType.Write, path: dir }],
                    undefined,
                    true,
                )
            );
            const result = ws.normalize('nonexistent');
            expect(result).toBe(path.join(dir, 'nonexistent'));
        });
    });
});

describe('DirectoryConfiguration.resolveSymlinks', () => {
    it('defaults to false', () => {
        const dc = new DirectoryConfiguration([{ type: AccessType.Write, path: '/tmp' }]);
        expect(dc.resolveSymlinks).toBe(false);
    });

    it('can be set to true', () => {
        const dc = new DirectoryConfiguration(
            [{ type: AccessType.Write, path: '/tmp' }],
            undefined,
            true,
        );
        expect(dc.resolveSymlinks).toBe(true);
    });

    it('can be set to false explicitly', () => {
        const dc = new DirectoryConfiguration(
            [{ type: AccessType.Write, path: '/tmp' }],
            undefined,
            false,
        );
        expect(dc.resolveSymlinks).toBe(false);
    });

    it('preserves workspacePath through deduplicate', () => {
        const dc = new DirectoryConfiguration(
            [
                { type: AccessType.Read, path: '/tmp' },
                { type: AccessType.Write, path: '/tmp' },
            ],
            undefined,
            true,
            '/workspace',
        );
        const deduped = dc.deduplicate();
        expect(deduped.workspacePath).toBe('/workspace');
    });

    it('is preserved through deduplicate', () => {
        const dc = new DirectoryConfiguration(
            [
                { type: AccessType.Read, path: '/tmp' },
                { type: AccessType.Write, path: '/tmp' },
            ],
            undefined,
            true,
        );
        const deduped = dc.deduplicate();
        expect(deduped.resolveSymlinks).toBe(true);
    });
});

describe('DirectoryConfiguration — default constructor (from env)', () => {
    afterEach(() => {
        delete process.env.LLM_CHAT_FS_READ_DIRS;
        delete process.env.LLM_CHAT_FS_WRITE_DIRS;
        delete process.env.LLM_CHAT_FS_WORKSPACE;
    });

    it('defaults workspace to cwd when no env vars set', () => {
        const result = new DirectoryConfiguration();
        expect(result.accesses).toHaveLength(1);
        expect(result.accesses[0]!.type).toBe('write');
        expect(result.accesses[0]!.path).toBe(process.cwd());
        expect(result.workspacePath).toBe(process.cwd());
    });

    it('reads workspace from env', () => {
        process.env.LLM_CHAT_FS_WORKSPACE = '/custom/ws';
        const result = new DirectoryConfiguration();
        expect(result.accesses).toHaveLength(1);
        expect(result.accesses[0]!.type).toBe('write');
        expect(result.accesses[0]!.path).toBe('/custom/ws');
        expect(result.workspacePath).toBe('/custom/ws');
    });

    it('parses read dirs from env', () => {
        process.env.LLM_CHAT_FS_READ_DIRS = '/var/log,/tmp';
        const result = new DirectoryConfiguration();
        expect(result.accesses).toHaveLength(3);
        expect(result.accesses[0]!.type).toBe('read');
        expect(result.accesses[0]!.path).toBe(path.resolve('/var/log'));
        expect(result.accesses[1]!.type).toBe('read');
        expect(result.accesses[1]!.path).toBe(path.resolve('/tmp'));
        expect(result.accesses[2]!.type).toBe('write');
        expect(result.accesses[2]!.path).toBe(process.cwd());
    });

    it('parses write dirs from env', () => {
        process.env.LLM_CHAT_FS_WRITE_DIRS = '/home/project,/home/other';
        const result = new DirectoryConfiguration();
        expect(result.accesses).toHaveLength(3);
        expect(result.accesses[0]!.type).toBe('write');
        expect(result.accesses[0]!.path).toBe(path.resolve('/home/project'));
        expect(result.accesses[1]!.type).toBe('write');
        expect(result.accesses[1]!.path).toBe(path.resolve('/home/other'));
        expect(result.accesses[2]!.type).toBe('write');
        expect(result.accesses[2]!.path).toBe(process.cwd());
    });

    it('deduplicates workspace when it matches a write dir', () => {
        process.env.LLM_CHAT_FS_WRITE_DIRS = '/home/project';
        process.env.LLM_CHAT_FS_WORKSPACE = '/home/project';
        const result = new DirectoryConfiguration();
        expect(result.accesses).toHaveLength(1);
        expect(result.accesses[0]!.type).toBe('write');
        expect(result.accesses[0]!.path).toBe(path.resolve('/home/project'));
    });

    it('workspace from env takes precedence as currentPath over write dirs', () => {
        process.env.LLM_CHAT_FS_WORKSPACE = '/workspace';
        process.env.LLM_CHAT_FS_WRITE_DIRS = '/some/output';
        const config = new DirectoryConfiguration();
        const ws = new Workspace(config);
        expect(ws.currentPath).toBe('/workspace');
    });

    it('combines read, write, and workspace dirs', () => {
        process.env.LLM_CHAT_FS_READ_DIRS = '/var/log';
        process.env.LLM_CHAT_FS_WRITE_DIRS = '/home/project';
        process.env.LLM_CHAT_FS_WORKSPACE = '/workspace';
        const result = new DirectoryConfiguration();
        expect(result.accesses).toHaveLength(3);
        expect(result.accesses[0]!.type).toBe('read');
        expect(result.accesses[0]!.path).toBe(path.resolve('/var/log'));
        expect(result.accesses[1]!.type).toBe('write');
        expect(result.accesses[1]!.path).toBe(path.resolve('/home/project'));
        expect(result.accesses[2]!.type).toBe('write');
        expect(result.accesses[2]!.path).toBe(path.resolve('/workspace'));
    });

    it('filters empty entries from read dirs', () => {
        process.env.LLM_CHAT_FS_READ_DIRS = '/var/log,, /tmp ,';
        const result = new DirectoryConfiguration();
        expect(result.accesses).toHaveLength(3);
        const readPaths = result.accesses.filter((a) => a.type === 'read').map((a) => a.path);
        expect(readPaths).toEqual([path.resolve('/var/log'), path.resolve('/tmp')]);
    });

    it('filters empty entries from write dirs', () => {
        process.env.LLM_CHAT_FS_WRITE_DIRS = '/home/a,, /home/b ,';
        const result = new DirectoryConfiguration();
        expect(result.accesses).toHaveLength(3);
        const writePaths = result.accesses.filter((a) => a.type === 'write').map((a) => a.path);
        expect(writePaths).toEqual([path.resolve('/home/a'), path.resolve('/home/b'), process.cwd()]);
    });

    it('resolveSymlinks defaults to false when env not set', () => {
        const result = new DirectoryConfiguration();
        expect(result.resolveSymlinks).toBe(false);
    });

    it('resolveSymlinks is true when env is "true"', () => {
        process.env.LLM_CHAT_FS_RESOLVE_SYMLINKS = 'true';
        const result = new DirectoryConfiguration();
        expect(result.resolveSymlinks).toBe(true);
    });

    it('resolveSymlinks is false when env is "false"', () => {
        process.env.LLM_CHAT_FS_RESOLVE_SYMLINKS = 'false';
        const result = new DirectoryConfiguration();
        expect(result.resolveSymlinks).toBe(false);
    });

    it('resolveSymlinks is false when env is any non-"true" value', () => {
        process.env.LLM_CHAT_FS_RESOLVE_SYMLINKS = '1';
        const result = new DirectoryConfiguration();
        expect(result.resolveSymlinks).toBe(false);
    });
});
