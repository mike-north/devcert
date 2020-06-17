"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const createDebug = require("debug");
const crypto = require("crypto");
const fs_1 = require("fs");
const rimraf_1 = require("rimraf");
const shared_1 = require("./shared");
const utils_1 = require("../utils");
const user_interface_1 = require("../user-interface");
const debug = createDebug('devcert:platforms:windows');
let encryptionKey;
class WindowsPlatform {
    constructor() {
        this.HOST_FILE_PATH = 'C:\\Windows\\System32\\Drivers\\etc\\hosts';
    }
    /**
     * Windows is at least simple. Like macOS, most applications will delegate to
     * the system trust store, which is updated with the confusingly named
     * `certutil` exe (not the same as the NSS/Mozilla certutil). Firefox does it's
     * own thing as usual, and getting a copy of NSS certutil onto the Windows
     * machine to try updating the Firefox store is basically a nightmare, so we
     * don't even try it - we just bail out to the GUI.
     */
    async addToTrustStores(certificatePath, options = {}) {
        // IE, Chrome, system utils
        debug('adding devcert root to Windows OS trust store');
        try {
            utils_1.run(`certutil -addstore -user root "${certificatePath}"`);
        }
        catch (e) {
            e.output.map((buffer) => {
                if (buffer) {
                    console.log(buffer.toString());
                }
            });
        }
        debug('adding devcert root to Firefox trust store');
        // Firefox (don't even try NSS certutil, no easy install for Windows)
        try {
            await shared_1.openCertificateInFirefox('start firefox', certificatePath);
        }
        catch (_a) {
            debug('Error opening Firefox, most likely Firefox is not installed');
        }
    }
    removeFromTrustStores(certificatePath) {
        debug('removing devcert root from Windows OS trust store');
        try {
            console.warn("Removing old certificates from trust stores. You may be prompted to grant permission for this. It's safe to delete old devcert certificates.");
            utils_1.run(`certutil -delstore -user root devcert`);
        }
        catch (e) {
            debug(`failed to remove ${certificatePath} from Windows OS trust store, continuing. ${e.toString()}`);
        }
    }
    async addDomainToHostFileIfMissing(domain) {
        const hostsFileContents = fs_1.readFileSync(this.HOST_FILE_PATH, 'utf8');
        if (!hostsFileContents.includes(domain)) {
            await utils_1.sudo(`echo 127.0.0.1  ${domain} >> ${this.HOST_FILE_PATH}`);
        }
    }
    deleteProtectedFiles(filepath) {
        shared_1.assertNotTouchingFiles(filepath, 'delete');
        rimraf_1.sync(filepath);
    }
    async readProtectedFile(filepath) {
        shared_1.assertNotTouchingFiles(filepath, 'read');
        if (!encryptionKey) {
            encryptionKey = await user_interface_1.default.getWindowsEncryptionPassword();
        }
        // Try to decrypt the file
        try {
            return this.decrypt(fs_1.readFileSync(filepath, 'utf8'), encryptionKey);
        }
        catch (e) {
            // If it's a bad password, clear the cached copy and retry
            if (e.message.indexOf('bad decrypt') >= -1) {
                encryptionKey = null;
                return await this.readProtectedFile(filepath);
            }
            throw e;
        }
    }
    async writeProtectedFile(filepath, contents) {
        shared_1.assertNotTouchingFiles(filepath, 'write');
        if (!encryptionKey) {
            encryptionKey = await user_interface_1.default.getWindowsEncryptionPassword();
        }
        const encryptedContents = this.encrypt(contents, encryptionKey);
        fs_1.writeFileSync(filepath, encryptedContents);
    }
    encrypt(text, key) {
        const cipher = crypto.createCipher('aes256', new Buffer(key));
        return cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
    }
    decrypt(encrypted, key) {
        const decipher = crypto.createDecipher('aes256', new Buffer(key));
        return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
    }
}
exports.default = WindowsPlatform;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luMzIuanMiLCJzb3VyY2VSb290IjoiLi8iLCJzb3VyY2VzIjpbInBsYXRmb3Jtcy93aW4zMi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLHFDQUFxQztBQUNyQyxpQ0FBaUM7QUFDakMsMkJBQWtFO0FBQ2xFLG1DQUF3QztBQUV4QyxxQ0FBNEU7QUFFNUUsb0NBQXFDO0FBQ3JDLHNEQUFtQztBQUVuQyxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsMkJBQTJCLENBQUMsQ0FBQztBQUV2RCxJQUFJLGFBQTRCLENBQUM7QUFFakMsTUFBcUIsZUFBZTtJQUFwQztRQUNVLG1CQUFjLEdBQUcsNENBQTRDLENBQUM7SUFnR3hFLENBQUM7SUE5RkM7Ozs7Ozs7T0FPRztJQUNILEtBQUssQ0FBQyxnQkFBZ0IsQ0FDcEIsZUFBdUIsRUFDdkIsVUFBbUIsRUFBRTtRQUVyQiwyQkFBMkI7UUFDM0IsS0FBSyxDQUFDLCtDQUErQyxDQUFDLENBQUM7UUFDdkQsSUFBSTtZQUNGLFdBQUcsQ0FBQyxrQ0FBa0MsZUFBZSxHQUFHLENBQUMsQ0FBQztTQUMzRDtRQUFDLE9BQU8sQ0FBQyxFQUFFO1lBQ1YsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFjLEVBQUUsRUFBRTtnQkFDOUIsSUFBSSxNQUFNLEVBQUU7b0JBQ1YsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztpQkFDaEM7WUFDSCxDQUFDLENBQUMsQ0FBQztTQUNKO1FBQ0QsS0FBSyxDQUFDLDRDQUE0QyxDQUFDLENBQUM7UUFDcEQscUVBQXFFO1FBQ3JFLElBQUk7WUFDRixNQUFNLGlDQUF3QixDQUFDLGVBQWUsRUFBRSxlQUFlLENBQUMsQ0FBQztTQUNsRTtRQUFDLFdBQU07WUFDTixLQUFLLENBQUMsNkRBQTZELENBQUMsQ0FBQztTQUN0RTtJQUNILENBQUM7SUFFRCxxQkFBcUIsQ0FBQyxlQUF1QjtRQUMzQyxLQUFLLENBQUMsbURBQW1E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akdELGtDQWlHQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNyZWF0ZURlYnVnIGZyb20gJ2RlYnVnJztcbmltcG9ydCAqIGFzIGNyeXB0byBmcm9tICdjcnlwdG8nO1xuaW1wb3J0IHsgd3JpdGVGaWxlU3luYyBhcyB3cml0ZSwgcmVhZEZpbGVTeW5jIGFzIHJlYWQgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBzeW5jIGFzIHJpbXJhZiB9IGZyb20gJ3JpbXJhZic7XG5pbXBvcnQgeyBPcHRpb25zIH0gZnJvbSAnLi4vaW5kZXgnO1xuaW1wb3J0IHsgYXNzZXJ0Tm90VG91Y2hpbmdGaWxlcywgb3BlbkNlcnRpZmljYXRlSW5GaXJlZm94IH0gZnJvbSAnLi9zaGFyZWQnO1xuaW1wb3J0IHsgUGxhdGZvcm0gfSBmcm9tICcuJztcbmltcG9ydCB7IHJ1biwgc3VkbyB9IGZyb20gJy4uL3V0aWxzJztcbmltcG9ydCBVSSBmcm9tICcuLi91c2VyLWludGVyZmFjZSc7XG5cbmNvbnN0IGRlYnVnID0gY3JlYXRlRGVidWcoJ2RldmNlcnQ6cGxhdGZvcm1zOndpbmRvd3MnKTtcblxubGV0IGVuY3J5cHRpb25LZXk6IHN0cmluZyB8IG51bGw7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFdpbmRvd3NQbGF0Zm9ybSBpbXBsZW1lbnRzIFBsYXRmb3JtIHtcbiAgcHJpdmF0ZSBIT1NUX0ZJTEVfUEFUSCA9ICdDOlxcXFxXaW5kb3dzXFxcXFN5c3RlbTMyXFxcXERyaXZlcnNcXFxcZXRjXFxcXGhvc3RzJztcblxuICAvKipcbiAgICogV2luZG93cyBpcyBhdCBsZWFzdCBzaW1wbGUuIExpa2UgbWFjT1MsIG1vc3QgYXBwbGljYXRpb25zIHdpbGwgZGVsZWdhdGUgdG9cbiAgICogdGhlIHN5c3RlbSB0cnVzdCBzdG9yZSwgd2hpY2ggaXMgdXBkYXRlZCB3aXRoIHRoZSBjb25mdXNpbmdseSBuYW1lZFxuICAgKiBgY2VydHV0aWxgIGV4ZSAobm90IHRoZSBzYW1lIGFzIHRoZSBOU1MvTW96aWxsYSBjZXJ0dXRpbCkuIEZpcmVmb3ggZG9lcyBpdCdzXG4gICAqIG93biB0aGluZyBhcyB1c3VhbCwgYW5kIGdldHRpbmcgYSBjb3B5IG9mIE5TUyBjZXJ0dXRpbCBvbnRvIHRoZSBXaW5kb3dzXG4gICAqIG1hY2hpbmUgdG8gdHJ5IHVwZGF0aW5nIHRoZSBGaXJlZm94IHN0b3JlIGlzIGJhc2ljYWxseSBhIG5pZ2h0bWFyZSwgc28gd2VcbiAgICogZG9uJ3QgZXZlbiB0cnkgaXQgLSB3ZSBqdXN0IGJhaWwgb3V0IHRvIHRoZSBHVUkuXG4gICAqL1xuICBhc3luYyBhZGRUb1RydXN0U3RvcmVzKFxuICAgIGNlcnRpZmljYXRlUGF0aDogc3RyaW5nLFxuICAgIG9wdGlvbnM6IE9wdGlvbnMgPSB7fVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAvLyBJRSwgQ2hyb21lLCBzeXN0ZW0gdXRpbHNcbiAgICBkZWJ1ZygnYWRkaW5nIGRldmNlcnQgcm9vdCB0byBXaW5kb3dzIE9TIHRydXN0IHN0b3JlJyk7XG4gICAgdHJ5IHtcbiAgICAgIHJ1bihgY2VydHV0aWwgLWFkZHN0b3JlIC11c2VyIHJvb3QgXCIke2NlcnRpZmljYXRlUGF0aH1cImApO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGUub3V0cHV0Lm1hcCgoYnVmZmVyOiBCdWZmZXIpID0+IHtcbiAgICAgICAgaWYgKGJ1ZmZlcikge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGJ1ZmZlci50b1N0cmluZygpKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICAgIGRlYnVnKCdhZGRpbmcgZGV2Y2VydCByb290IHRvIEZpcmVmb3ggdHJ1c3Qgc3RvcmUnKTtcbiAgICAvLyBGaXJlZm94IChkb24ndCBldmVuIHRyeSBOU1MgY2VydHV0aWwsIG5vIGVhc3kgaW5zdGFsbCBmb3IgV2luZG93cylcbiAgICB0cnkge1xuICAgICAgYXdhaXQgb3BlbkNlcnRpZmljYXRlSW5GaXJlZm94KCdzdGFydCBmaXJlZm94JywgY2VydGlmaWNhdGVQYXRoKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIGRlYnVnKCdFcnJvciBvcGVuaW5nIEZpcmVmb3gsIG1vc3QgbGlrZWx5IEZpcmVmb3ggaXMgbm90IGluc3RhbGxlZCcpO1xuICAgIH1cbiAgfVxuXG4gIHJlbW92ZUZyb21UcnVzdFN0b3JlcyhjZXJ0aWZpY2F0ZVBhdGg6IHN0cmluZyk6IHZvaWQge1xuICAgIGRlYnVnKCdyZW1vdmluZyBkZXZjZXJ0IHJvb3QgZnJvbSBXaW5kb3dzIE9TIHRydXN0IHN0b3JlJyk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgXCJSZW1vdmluZyBvbGQgY2VydGlmaWNhdGVzIGZyb20gdHJ1c3Qgc3RvcmVzLiBZb3UgbWF5IGJlIHByb21wdGVkIHRvIGdyYW50IHBlcm1pc3Npb24gZm9yIHRoaXMuIEl0J3Mgc2FmZSB0byBkZWxldGUgb2xkIGRldmNlcnQgY2VydGlmaWNhdGVzLlwiXG4gICAgICApO1xuICAgICAgcnVuKGBjZXJ0dXRpbCAtZGVsc3RvcmUgLXVzZXIgcm9vdCBkZXZjZXJ0YCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgZGVidWcoXG4gICAgICAgIGBmYWlsZWQgdG8gcmVtb3ZlICR7Y2VydGlmaWNhdGVQYXRofSBmcm9tIFdpbmRvd3MgT1MgdHJ1c3Qgc3RvcmUsIGNvbnRpbnVpbmcuICR7ZS50b1N0cmluZygpfWBcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgYWRkRG9tYWluVG9Ib3N0RmlsZUlmTWlzc2luZyhkb21haW46IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGhvc3RzRmlsZUNvbnRlbnRzID0gcmVhZCh0aGlzLkhPU1RfRklMRV9QQVRILCAndXRmOCcpO1xuICAgIGlmICghaG9zdHNGaWxlQ29udGVudHMuaW5jbHVkZXMoZG9tYWluKSkge1xuICAgICAgYXdhaXQgc3VkbyhgZWNobyAxMjcuMC4wLjEgICR7ZG9tYWlufSA+PiAke3RoaXMuSE9TVF9GSUxFX1BBVEh9YCk7XG4gICAgfVxuICB9XG5cbiAgZGVsZXRlUHJvdGVjdGVkRmlsZXMoZmlsZXBhdGg6IHN0cmluZyk6IHZvaWQge1xuICAgIGFzc2VydE5vdFRvdWNoaW5nRmlsZXMoZmlsZXBhdGgsICdkZWxldGUnKTtcbiAgICByaW1yYWYoZmlsZXBhdGgpO1xuICB9XG5cbiAgYXN5bmMgcmVhZFByb3RlY3RlZEZpbGUoZmlsZXBhdGg6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgYXNzZXJ0Tm90VG91Y2hpbmdGaWxlcyhmaWxlcGF0aCwgJ3JlYWQnKTtcbiAgICBpZiAoIWVuY3J5cHRpb25LZXkpIHtcbiAgICAgIGVuY3J5cHRpb25LZXkgPSBhd2FpdCBVSS5nZXRXaW5kb3dzRW5jcnlwdGlvblBhc3N3b3JkKCk7XG4gICAgfVxuICAgIC8vIFRyeSB0byBkZWNyeXB0IHRoZSBmaWxlXG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiB0aGlzLmRlY3J5cHQocmVhZChmaWxlcGF0aCwgJ3V0ZjgnKSwgZW5jcnlwdGlvbktleSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgLy8gSWYgaXQncyBhIGJhZCBwYXNzd29yZCwgY2xlYXIgdGhlIGNhY2hlZCBjb3B5IGFuZCByZXRyeVxuICAgICAgaWYgKGUubWVzc2FnZS5pbmRleE9mKCdiYWQgZGVjcnlwdCcpID49IC0xKSB7XG4gICAgICAgIGVuY3J5cHRpb25LZXkgPSBudWxsO1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5yZWFkUHJvdGVjdGVkRmlsZShmaWxlcGF0aCk7XG4gICAgICB9XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHdyaXRlUHJvdGVjdGVkRmlsZShmaWxlcGF0aDogc3RyaW5nLCBjb250ZW50czogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXNzZXJ0Tm90VG91Y2hpbmdGaWxlcyhmaWxlcGF0aCwgJ3dyaXRlJyk7XG4gICAgaWYgKCFlbmNyeXB0aW9uS2V5KSB7XG4gICAgICBlbmNyeXB0aW9uS2V5ID0gYXdhaXQgVUkuZ2V0V2luZG93c0VuY3J5cHRpb25QYXNzd29yZCgpO1xuICAgIH1cbiAgICBjb25zdCBlbmNyeXB0ZWRDb250ZW50cyA9IHRoaXMuZW5jcnlwdChjb250ZW50cywgZW5jcnlwdGlvbktleSk7XG4gICAgd3JpdGUoZmlsZXBhdGgsIGVuY3J5cHRlZENvbnRlbnRzKTtcbiAgfVxuXG4gIHByaXZhdGUgZW5jcnlwdCh0ZXh0OiBzdHJpbmcsIGtleTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCBjaXBoZXIgPSBjcnlwdG8uY3JlYXRlQ2lwaGVyKCdhZXMyNTYnLCBuZXcgQnVmZmVyKGtleSkpO1xuICAgIHJldHVybiBjaXBoZXIudXBkYXRlKHRleHQsICd1dGY4JywgJ2hleCcpICsgY2lwaGVyLmZpbmFsKCdoZXgnKTtcbiAgfVxuXG4gIHByaXZhdGUgZGVjcnlwdChlbmNyeXB0ZWQ6IHN0cmluZywga2V5OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IGRlY2lwaGVyID0gY3J5cHRvLmNyZWF0ZURlY2lwaGVyKCdhZXMyNTYnLCBuZXcgQnVmZmVyKGtleSkpO1xuICAgIHJldHVybiBkZWNpcGhlci51cGRhdGUoZW5jcnlwdGVkLCAnaGV4JywgJ3V0ZjgnKSArIGRlY2lwaGVyLmZpbmFsKCd1dGY4Jyk7XG4gIH1cbn1cbiJdfQ==