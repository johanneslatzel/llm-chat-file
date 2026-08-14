import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileConfiguration, SearchConfiguration } from '../../src/lib/config.js';

const FS_KEYS = [
    'LLM_CHAT_FS_MAX_CHARS_PER_FILE',
    'LLM_CHAT_FS_MAX_FILE_SIZE',
    'LLM_CHAT_FS_REQUIRE_READ_BEFORE_WRITE',
    'LLM_CHAT_FS_MAX_SEARCH_RESULTS',
    'LLM_CHAT_FS_MAX_DISPLAY_ENTRIES',
    'LLM_CHAT_FS_MAX_TOTAL_ENTRIES',
    'LLM_CHAT_FS_SEARCH_TIMEOUT'
];

beforeEach(() => {
    for (const key of FS_KEYS) {
        delete process.env[key];
    }
});

afterEach(() => {
    for (const key of FS_KEYS) {
        delete process.env[key];
    }
});

describe('FileConfiguration', () => {
    it('defaults maxCharsPerFile to 100000', () => {
        expect(new FileConfiguration().maxCharsPerFile).toBe(100_000);
    });

    it('env override wins for maxCharsPerFile', () => {
        process.env.LLM_CHAT_FS_MAX_CHARS_PER_FILE = '123';
        expect(new FileConfiguration().maxCharsPerFile).toBe(123);
    });

    it('NaN env falls back to default', () => {
        process.env.LLM_CHAT_FS_MAX_CHARS_PER_FILE = 'abc';
        expect(new FileConfiguration().maxCharsPerFile).toBe(100_000);
    });

    it('empty env falls back to default', () => {
        process.env.LLM_CHAT_FS_MAX_CHARS_PER_FILE = '';
        expect(new FileConfiguration().maxCharsPerFile).toBe(100_000);
    });

    it('zero env clamps to 1', () => {
        process.env.LLM_CHAT_FS_MAX_CHARS_PER_FILE = '0';
        expect(new FileConfiguration().maxCharsPerFile).toBe(1);
    });

    it('negative env clamps to 1', () => {
        process.env.LLM_CHAT_FS_MAX_CHARS_PER_FILE = '-5';
        expect(new FileConfiguration().maxCharsPerFile).toBe(1);
    });

    it('constructor override wins over env', () => {
        process.env.LLM_CHAT_FS_MAX_CHARS_PER_FILE = '123';
        expect(new FileConfiguration(9).maxCharsPerFile).toBe(9);
    });

    it('defaults maxFileSize to 10485760', () => {
        expect(new FileConfiguration().maxFileSize).toBe(10 * 1024 * 1024);
    });

    it('maxFileSize env override wins', () => {
        process.env.LLM_CHAT_FS_MAX_FILE_SIZE = '2048';
        expect(new FileConfiguration().maxFileSize).toBe(2048);
    });

    it('maxFileSize constructor override wins', () => {
        process.env.LLM_CHAT_FS_MAX_FILE_SIZE = '2048';
        expect(new FileConfiguration(undefined, 1024).maxFileSize).toBe(1024);
    });

    it('defaults requireReadBeforeWrite to true', () => {
        expect(new FileConfiguration().requireReadBeforeWrite).toBe(true);
    });

    it('requireReadBeforeWrite env true', () => {
        process.env.LLM_CHAT_FS_REQUIRE_READ_BEFORE_WRITE = 'true';
        expect(new FileConfiguration().requireReadBeforeWrite).toBe(true);
    });

    it('requireReadBeforeWrite env false', () => {
        process.env.LLM_CHAT_FS_REQUIRE_READ_BEFORE_WRITE = 'false';
        expect(new FileConfiguration().requireReadBeforeWrite).toBe(false);
    });

    it('requireReadBeforeWrite env garbage', () => {
        process.env.LLM_CHAT_FS_REQUIRE_READ_BEFORE_WRITE = 'garbage';
        expect(new FileConfiguration().requireReadBeforeWrite).toBe(false);
    });

    it('requireReadBeforeWrite constructor override wins', () => {
        process.env.LLM_CHAT_FS_REQUIRE_READ_BEFORE_WRITE = 'true';
        expect(new FileConfiguration(undefined, undefined, false).requireReadBeforeWrite).toBe(
            false
        );
    });
});

describe('SearchConfiguration', () => {
    it('defaults search limits', () => {
        const sc = new SearchConfiguration();
        expect(sc.maxSearchResults).toBe(50);
        expect(sc.maxDisplayEntries).toBe(200);
        expect(sc.maxTotalEntries).toBe(5000);
        expect(sc.timeoutMs).toBe(10000);
    });

    it('env overrides search limits', () => {
        process.env.LLM_CHAT_FS_MAX_SEARCH_RESULTS = '5';
        process.env.LLM_CHAT_FS_MAX_DISPLAY_ENTRIES = '6';
        process.env.LLM_CHAT_FS_MAX_TOTAL_ENTRIES = '7';
        process.env.LLM_CHAT_FS_SEARCH_TIMEOUT = '8';
        const sc = new SearchConfiguration();
        expect(sc.maxSearchResults).toBe(5);
        expect(sc.maxDisplayEntries).toBe(6);
        expect(sc.maxTotalEntries).toBe(7);
        expect(sc.timeoutMs).toBe(8);
    });

    it('constructor overrides env', () => {
        process.env.LLM_CHAT_FS_MAX_SEARCH_RESULTS = '5';
        process.env.LLM_CHAT_FS_MAX_DISPLAY_ENTRIES = '6';
        process.env.LLM_CHAT_FS_MAX_TOTAL_ENTRIES = '7';
        process.env.LLM_CHAT_FS_SEARCH_TIMEOUT = '8';
        const sc = new SearchConfiguration(1, 2, 3, 4);
        expect(sc.maxSearchResults).toBe(1);
        expect(sc.maxDisplayEntries).toBe(2);
        expect(sc.maxTotalEntries).toBe(3);
        expect(sc.timeoutMs).toBe(4);
    });
});
