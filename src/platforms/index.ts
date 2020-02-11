import { Options } from '../index';

export interface Platform {
  addToTrustStores(
    certificatePath: string,
    options?: Options
  ): void | Promise<void>;
  removeFromTrustStores(certificatePath: string): void;
  addDomainToHostFileIfMissing(domain: string): void | Promise<void>;
  deleteProtectedFiles(filepath: string): void;
  readProtectedFile(filepath: string): string | Promise<string>;
  writeProtectedFile(filepath: string, contents: string): void | Promise<void>;
}

const PlatformClass = require(`./${process.platform}`).default;
export default new PlatformClass() as Platform;
