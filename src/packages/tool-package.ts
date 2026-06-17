import { ToolPackage } from '@johannes.latzel/llm-chat';
import { Workspace } from '../lib/workspace.js';
import { SearchConfiguration, FileConfiguration } from '../lib/config.js';
import { FilePool } from '../lib/file-pool.js';
import { ReadFileTool } from '../tools/read-file.js';
import { WriteFileTool } from '../tools/write-file.js';
import { SearchEntriesTool } from '../tools/search.js';
import { ListDirectoryTool } from '../tools/list-directory.js';
import { CreateFolderTool } from '../tools/create-folder.js';
import { DeleteFileTool } from '../tools/delete-file.js';
import { MoveFileTool } from '../tools/move-file.js';
import { SwitchWorkspaceTool } from '../tools/switch-workspace.js';
import { FileAccessInfoTool } from '../tools/file-access-info.js';
import { EntryInfoTool } from '../tools/entry-info.js';
import { ReplaceFileLinesTool } from '../tools/replace-file-lines.js';
import { InsertFileContentTool } from '../tools/insert-file-content.js';
import { ReplaceFileContentTool } from '../tools/replace-file-content.js';

/**
 * Aggregates all filesystem tools into a single {@link ToolPackage} for use with
 * an LLM chat agent.
 *
 * Provides tools for reading, writing, searching, listing, creating, deleting,
 * and moving files and directories within a configured workspace.
 */
export class FileToolPackage extends ToolPackage {
    private fileConfig: FileConfiguration;

    /**
     * @param workspace - The workspace for path resolution and access checks.
     * @param searchConfig - Configuration for search limits.
     * @param fileConfig - Configuration for file size, character limits, and
     *   the read-before-write policy.
     * @param filePool - Optional pool for enforcing read-before-write checks.
     *   Created from {@link fileConfig} if not provided.
     */
    constructor(
        workspace: Workspace,
        searchConfig?: SearchConfiguration,
        fileConfig?: FileConfiguration,
        filePool?: FilePool
    ) {
        const safeConfig = fileConfig ?? new FileConfiguration();
        filePool ??= new FilePool(safeConfig);
        super([
            new SearchEntriesTool(workspace, searchConfig, fileConfig),
            new ListDirectoryTool(workspace, searchConfig),
            new ReadFileTool(workspace, safeConfig, filePool),
            new WriteFileTool(workspace, safeConfig, filePool),
            new ReplaceFileLinesTool(workspace, safeConfig, filePool),
            new InsertFileContentTool(workspace, safeConfig, filePool),
            new ReplaceFileContentTool(workspace, safeConfig, filePool),
            new EntryInfoTool(workspace),
            new DeleteFileTool(workspace),
            new CreateFolderTool(workspace),
            new MoveFileTool(workspace),
            new FileAccessInfoTool(workspace),
            new SwitchWorkspaceTool(workspace)
        ]);
        this.fileConfig = safeConfig;
    }

    /**
     * Returns a tutorial string that describes the available filesystem tools,
     * path resolution rules, and (when enabled) the read-before-write policy.
     */
    tutorial(): string | null {
        const lines = [
            'Filesystem tools for reading, writing, searching, and managing files and directories.',
            '',
            'Path resolution:',
            '  - Relative paths (e.g. ".", "src/index.ts") resolve against the current workspace root.',
            '  - Absolute paths starting with "/" refer to the filesystem root, not workspace root.',
            '  - Use "." for the workspace root itself.',
            '  - Call file_access_info first to see which directories are accessible.',
            '',
            'Writing vs editing:',
            '  - write_file: Creates a new file or replaces the entire content of an existing file.',
            '  - replace_file_lines: Replaces a specific range of lines (partial edit).',
            '  - insert_file_content: Inserts new lines at a specific position without deletion.',
            '  - replace_file_content: Find-and-replace an exact substring.',
            '  - The three edit tools require the file to already exist; write_file can also create new files.',
            ''
        ];

        if (this.fileConfig.requireReadBeforeWrite) {
            lines.push(
                'Read before write:',
                '  - Files must be read with read_file before they can be modified.',
                '  - A write also counts as a read, so read -> write -> write is allowed.',
                '  - This ensures the current file content is known before edits are applied.',
                ''
            );
        }

        lines.push(
            'Reading:',
            '  - read_file: Reads the full content of one or more files.',
            '  - read_file with start_line/end_line: Reads a specific range of lines only.',
            '',
            'Tips:',
            '  - Start by listing the workspace root (list_directory with path ".") to explore.',
            '  - Use search_entries with name_pattern or content_pattern to find files.',
            '  - Directories are suffixed with "/" in listings and search results.'
        );

        return lines.join('\n');
    }
}
