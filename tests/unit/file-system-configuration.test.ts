import { describe, it, expect, afterEach } from 'vitest';
import {
    SearchConfiguration,
    FileConfiguration,
} from '../../src/lib/config.js';

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
    it('defaults maxCharsPerFile to 100000', () => {
        const fc = new FileConfiguration();
        expect(fc.maxCharsPerFile).toBe(100000);
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
        expect(fc.maxCharsPerFile).toBe(100000);
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

    it('defaults requireReadBeforeWrite to true', () => {
        const fc = new FileConfiguration();
        expect(fc.requireReadBeforeWrite).toBe(true);
    });

    it('reads requireReadBeforeWrite true from env', () => {
        process.env.LLM_CHAT_FS_REQUIRE_READ_BEFORE_WRITE = 'true';
        const fc = new FileConfiguration();
        expect(fc.requireReadBeforeWrite).toBe(true);
        delete process.env.LLM_CHAT_FS_REQUIRE_READ_BEFORE_WRITE;
    });

    it('reads requireReadBeforeWrite false from env', () => {
        process.env.LLM_CHAT_FS_REQUIRE_READ_BEFORE_WRITE = 'false';
        const fc = new FileConfiguration();
        expect(fc.requireReadBeforeWrite).toBe(false);
        delete process.env.LLM_CHAT_FS_REQUIRE_READ_BEFORE_WRITE;
    });

    it('prefers explicit requireReadBeforeWrite over env', () => {
        process.env.LLM_CHAT_FS_REQUIRE_READ_BEFORE_WRITE = 'false';
        const fc = new FileConfiguration(undefined, undefined, true);
        expect(fc.requireReadBeforeWrite).toBe(true);
        delete process.env.LLM_CHAT_FS_REQUIRE_READ_BEFORE_WRITE;
    });
});
