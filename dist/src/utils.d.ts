/// <reference types="node" />
import { ExecSyncOptions } from 'child_process';
import * as tmp from 'tmp';
export declare function openssl(cmd: string, description: string): string;
export declare function run(cmd: string, options?: ExecSyncOptions): string;
export declare function waitForUser(): Promise<void>;
export declare function reportableError(message: string): Error;
export declare function tmpDir(): tmp.SynchrounousResult;
export declare function sudo(cmd: string): Promise<string | null>;
export declare function hasSudo(): boolean;
export declare function pathForDomain(domain: string, ...pathSegments: string[]): string;
export declare function certPathForDomain(commonName: string): string;
export declare function keyPathForDomain(commonName: string): string;
export declare function hasCertificateFor(commonName: string): boolean;
