import type { Dirent } from 'node:fs';

/** Type of filesystem access (read or write). */
export enum AccessType {
    /** Read-only access — files can be listed and read but not modified. */
    Read = 'read',
    /** Read-write access — files can be created, modified and deleted. */
    Write = 'write'
}

/** A single filesystem access entry granting a type of access to a directory. */
export interface Access {
    /** Whether this grants read or write access to the directory. */
    type: AccessType;
    /** Absolute path to the directory this access applies to. */
    path: string;
}

/** An entry yielded when recursively walking a directory tree. */
export interface WalkEntry {
    /** Absolute path to the file or directory. */
    filePath: string;
    /** `fs.Dirent` from the directory read operation, providing type and name information. */
    dirent: Dirent;
}
