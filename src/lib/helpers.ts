import { isBinaryFile } from 'isbinaryfile';

/**
 * Checks whether a file is binary by reading its header bytes.
 * If the check fails (e.g. the file doesn't exist), it returns `true` to err on the side of caution.
 *
 * @param filePath - Path to the file to check.
 * @returns `true` if the file is binary or the check fails, `false` if it appears to be text.
 */
export async function isBinary(filePath: string): Promise<boolean> {
    try {
        return await isBinaryFile(filePath);
    } catch {
        return true;
    }
}
