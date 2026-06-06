import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import * as fsp from 'node:fs/promises';
import { isBinary } from '../../src/lib/helpers.js';
import { createTempDir, removeTempDir } from '../index.js';

describe('isBinary', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = createTempDir();
    });

    afterEach(() => {
        removeTempDir(tmpDir);
    });

    it('returns false for a text file', async () => {
        const filePath = path.join(tmpDir, 'test.txt');
        await fsp.writeFile(filePath, 'hello world');
        const result = await isBinary(filePath);
        expect(result).toBe(false);
    });

    it('returns true for a non-existent file path', async () => {
        const result = await isBinary(path.join(tmpDir, 'nonexistent.bin'));
        expect(result).toBe(true);
    });
});
