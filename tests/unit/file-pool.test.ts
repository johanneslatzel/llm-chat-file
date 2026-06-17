import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import { FilePool } from '../../src/lib/file-pool.js';
import { FileConfiguration } from '../../src/lib/config.js';
import { createTempDir, removeTempDir, createTempFile } from '../index.js';

describe('FilePool', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = createTempDir();
    });

    afterEach(() => {
        removeTempDir(tmpDir);
    });

    describe('with requireReadBeforeWrite: true', () => {
        let pool: FilePool;

        beforeEach(() => {
            pool = new FilePool(new FileConfiguration(undefined, undefined, true));
        });

        it('rejects write when file was not read', async () => {
            const filePath = createTempFile(tmpDir, 'test.txt', 'content');
            const result = await pool.verifyWrite(filePath);
            expect(result).not.toBeNull();
            expect(result!.status).toBe('error');
            expect(result!.result).toContain('must be read');
        });

        it('allows write after read', async () => {
            const filePath = createTempFile(tmpDir, 'test.txt', 'content');
            await pool.recordRead(filePath);
            const result = await pool.verifyWrite(filePath);
            expect(result).toBeNull();
        });

        it('rejects write when mtime changed since read', async () => {
            const filePath = createTempFile(tmpDir, 'test.txt', 'content');
            await pool.recordRead(filePath);
            await fsp.utimes(filePath, new Date(), new Date(Date.now() + 1000));
            const result = await pool.verifyWrite(filePath);
            expect(result).not.toBeNull();
            expect(result!.result).toContain('changed since last read');
        });

        it('rejects write when file is deleted after read', async () => {
            const filePath = createTempFile(tmpDir, 'test.txt', 'content');
            await pool.recordRead(filePath);
            await fsp.rm(filePath);
            const result = await pool.verifyWrite(filePath);
            expect(result).not.toBeNull();
            expect(result!.result).toContain('must be read');
        });

        it('allows new file without prior read when allowNew is true', async () => {
            const filePath = tmpDir + '/new.txt';
            const result = await pool.verifyWrite(filePath, true);
            expect(result).toBeNull();
        });

        it('rejects existing file without prior read even when allowNew is true', async () => {
            const filePath = createTempFile(tmpDir, 'test.txt', 'content');
            const result = await pool.verifyWrite(filePath, true);
            expect(result).not.toBeNull();
            expect(result!.result).toContain('must be read');
        });

        it('updates timestamp after recordWrite', async () => {
            const filePath = createTempFile(tmpDir, 'test.txt', 'content');
            await pool.recordRead(filePath);
            await pool.recordWrite(filePath);
            const result = await pool.verifyWrite(filePath);
            expect(result).toBeNull();
        });
    });

    describe('with requireReadBeforeWrite: false', () => {
        let pool: FilePool;

        beforeEach(() => {
            pool = new FilePool(new FileConfiguration(undefined, undefined, false));
        });

        it('allows write without prior read', async () => {
            const filePath = createTempFile(tmpDir, 'test.txt', 'content');
            const result = await pool.verifyWrite(filePath);
            expect(result).toBeNull();
        });

        it('recordRead does nothing', async () => {
            const filePath = createTempFile(tmpDir, 'test.txt', 'content');
            await pool.recordRead(filePath);
            const result = await pool.verifyWrite(filePath);
            expect(result).toBeNull();
        });

        it('recordWrite does nothing', async () => {
            const filePath = createTempFile(tmpDir, 'test.txt', 'content');
            await pool.recordWrite(filePath);
            expect(true).toBe(true);
        });
    });
});
