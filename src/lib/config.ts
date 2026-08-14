/** Configuration for file search operations (content search, name search, timestamp search, etc.). */
export class SearchConfiguration {
    /**
     * Maximum number of search results to return.
     * Falls back to the `LLM_CHAT_FS_MAX_SEARCH_RESULTS` environment variable, or `50` if not set.
     */
    maxSearchResults: number;

    /**
     * Threshold above which results are returned as a count summary instead of individual paths.
     * Falls back to `LLM_CHAT_FS_MAX_DISPLAY_ENTRIES` or `200`.
     */
    maxDisplayEntries: number;

    /**
     * Hard limit on total entries to traverse. Returns an error if exceeded.
     * Falls back to `LLM_CHAT_FS_MAX_TOTAL_ENTRIES` or `5000`.
     */
    maxTotalEntries: number;

    /**
     * Total search timeout in milliseconds. The search returns partial results if this is exceeded.
     * Falls back to `LLM_CHAT_FS_SEARCH_TIMEOUT` or `10000`.
     */
    timeoutMs: number;

    /**
     * @param maxSearchResults - Maximum results. Defaults to env `LLM_CHAT_FS_MAX_SEARCH_RESULTS` or `50`.
     * @param maxDisplayEntries - Display threshold. Defaults to env `LLM_CHAT_FS_MAX_DISPLAY_ENTRIES` or `200`.
     * @param maxTotalEntries - Hard traversal limit. Defaults to env `LLM_CHAT_FS_MAX_TOTAL_ENTRIES` or `5000`.
     * @param timeoutMs - Total search timeout. Defaults to env `LLM_CHAT_FS_SEARCH_TIMEOUT` or `10000`.
     */
    constructor(
        maxSearchResults?: number,
        maxDisplayEntries?: number,
        maxTotalEntries?: number,
        timeoutMs?: number
    ) {
        this.maxSearchResults =
            maxSearchResults ?? parseEnvInt('LLM_CHAT_FS_MAX_SEARCH_RESULTS', 50);
        this.maxDisplayEntries =
            maxDisplayEntries ?? parseEnvInt('LLM_CHAT_FS_MAX_DISPLAY_ENTRIES', 200);
        this.maxTotalEntries =
            maxTotalEntries ?? parseEnvInt('LLM_CHAT_FS_MAX_TOTAL_ENTRIES', 5000);
        this.timeoutMs = timeoutMs ?? parseEnvInt('LLM_CHAT_FS_SEARCH_TIMEOUT', 10000);
    }
}

/** Configuration for file read/write operations (character limits, etc.). */
export class FileConfiguration {
    /**
     * Maximum number of characters allowed per file read or write.
     * Falls back to the `LLM_CHAT_FS_MAX_CHARS_PER_FILE` environment variable, or `100000` if not set.
     */
    maxCharsPerFile: number;

    /**
     * Maximum file size in bytes allowed for read operations.
     * Falls back to the `LLM_CHAT_FS_MAX_FILE_SIZE` environment variable, or `10485760` (10 MB) if not set.
     */
    maxFileSize: number;

    /**
     * When `true`, write/edit tools require the file to have been read via `read_file`
     * before modifications are allowed. Falls back to the `LLM_CHAT_FS_REQUIRE_READ_BEFORE_WRITE`
     * environment variable, or `false` if not set.
     */
    requireReadBeforeWrite: boolean;

    /**
     * @param maxCharsPerFile - Maximum chars. Defaults to env `LLM_CHAT_FS_MAX_CHARS_PER_FILE` or `100000`.
     * @param maxFileSize - Maximum file size in bytes. Defaults to env `LLM_CHAT_FS_MAX_FILE_SIZE` or `10485760` (10 MB).
     * @param requireReadBeforeWrite - Require read before write. Defaults to env `LLM_CHAT_FS_REQUIRE_READ_BEFORE_WRITE` or `true`.
     */
    constructor(maxCharsPerFile?: number, maxFileSize?: number, requireReadBeforeWrite?: boolean) {
        this.maxCharsPerFile =
            maxCharsPerFile ?? parseEnvInt('LLM_CHAT_FS_MAX_CHARS_PER_FILE', 100000);
        this.maxFileSize =
            maxFileSize ?? parseEnvInt('LLM_CHAT_FS_MAX_FILE_SIZE', 10 * 1024 * 1024);
        this.requireReadBeforeWrite =
            requireReadBeforeWrite ?? parseEnvBool('LLM_CHAT_FS_REQUIRE_READ_BEFORE_WRITE', true);
    }
}

function parseEnvInt(key: string, fallback: number, min = 1): number {
    const raw = process.env[key];
    if (raw === undefined || raw === '') return Math.max(min, fallback);
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? Math.max(min, fallback) : Math.max(min, parsed);
}

function parseEnvBool(key: string, fallback: boolean): boolean {
    const raw = process.env[key];
    if (raw === undefined || raw === '') return fallback;
    return raw === 'true';
}
