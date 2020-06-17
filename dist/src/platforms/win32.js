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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luMzIuanMiLCJzb3VyY2VSb290IjoiLi8iLCJzb3VyY2VzIjpbInNyYy9wbGF0Zm9ybXMvd2luMzIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxxQ0FBcUM7QUFDckMsaUNBQWlDO0FBQ2pDLDJCQUFrRTtBQUNsRSxtQ0FBd0M7QUFFeEMscUNBQTRFO0FBRTVFLG9DQUFxQztBQUNyQyxzREFBbUM7QUFFbkMsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLDJCQUEyQixDQUFDLENBQUM7QUFFdkQsSUFBSSxhQUE0QixDQUFDO0FBRWpDLE1BQXFCLGVBQWU7SUFBcEM7UUFDVSxtQkFBYyxHQUFHLDRDQUE0QyxDQUFDO0lBZ0d4RSxDQUFDO0lBOUZDOzs7Ozs7O09BT0c7SUFDSCxLQUFLLENBQUMsZ0JBQWdCLENBQ3BCLGVBQXVCLEVBQ3ZCLFVBQW1CLEVBQUU7UUFFckIsMkJBQTJCO1FBQzNCLEtBQUssQ0FBQywrQ0FBK0MsQ0FBQyxDQUFDO1FBQ3ZELElBQUk7WUFDRixXQUFHLENBQUMsa0NBQWtDLGVBQWUsR0FBRyxDQUFDLENBQUM7U0FDM0Q7UUFBQyxPQUFPLENBQUMsRUFBRTtZQUNWLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBYyxFQUFFLEVBQUU7Z0JBQzlCLElBQUksTUFBTSxFQUFFO29CQUNWLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7aUJBQ2hDO1lBQ0gsQ0FBQyxDQUFDLENBQUM7U0FDSjtRQUNELEtBQUssQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDO1FBQ3BELHFFQUFxRTtRQUNyRSxJQUFJO1lBQ0YsTUFBTSxpQ0FBd0IsQ0FBQyxlQUFlLEVBQUUsZUFBZSxDQUFDLENBQUM7U0FDbEU7UUFBQyxXQUFNO1lBQ04sS0FBSyxDQUFDLDZEQUE2RCxDQUFDLENBQUM7U0FDdEU7SUFDSCxDQUFDO0lBRUQscUJBQXFCLENBQUMsZUFBdUI7UUFDM0MsS0FBSyxDQUFDLG1E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RjtBQWpHRCxrQ0FpR0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjcmVhdGVEZWJ1ZyBmcm9tICdkZWJ1Zyc7XG5pbXBvcnQgKiBhcyBjcnlwdG8gZnJvbSAnY3J5cHRvJztcbmltcG9ydCB7IHdyaXRlRmlsZVN5bmMgYXMgd3JpdGUsIHJlYWRGaWxlU3luYyBhcyByZWFkIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgc3luYyBhcyByaW1yYWYgfSBmcm9tICdyaW1yYWYnO1xuaW1wb3J0IHsgT3B0aW9ucyB9IGZyb20gJy4uL2luZGV4JztcbmltcG9ydCB7IGFzc2VydE5vdFRvdWNoaW5nRmlsZXMsIG9wZW5DZXJ0aWZpY2F0ZUluRmlyZWZveCB9IGZyb20gJy4vc2hhcmVkJztcbmltcG9ydCB7IFBsYXRmb3JtIH0gZnJvbSAnLic7XG5pbXBvcnQgeyBydW4sIHN1ZG8gfSBmcm9tICcuLi91dGlscyc7XG5pbXBvcnQgVUkgZnJvbSAnLi4vdXNlci1pbnRlcmZhY2UnO1xuXG5jb25zdCBkZWJ1ZyA9IGNyZWF0ZURlYnVnKCdkZXZjZXJ0OnBsYXRmb3Jtczp3aW5kb3dzJyk7XG5cbmxldCBlbmNyeXB0aW9uS2V5OiBzdHJpbmcgfCBudWxsO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBXaW5kb3dzUGxhdGZvcm0gaW1wbGVtZW50cyBQbGF0Zm9ybSB7XG4gIHByaXZhdGUgSE9TVF9GSUxFX1BBVEggPSAnQzpcXFxcV2luZG93c1xcXFxTeXN0ZW0zMlxcXFxEcml2ZXJzXFxcXGV0Y1xcXFxob3N0cyc7XG5cbiAgLyoqXG4gICAqIFdpbmRvd3MgaXMgYXQgbGVhc3Qgc2ltcGxlLiBMaWtlIG1hY09TLCBtb3N0IGFwcGxpY2F0aW9ucyB3aWxsIGRlbGVnYXRlIHRvXG4gICAqIHRoZSBzeXN0ZW0gdHJ1c3Qgc3RvcmUsIHdoaWNoIGlzIHVwZGF0ZWQgd2l0aCB0aGUgY29uZnVzaW5nbHkgbmFtZWRcbiAgICogYGNlcnR1dGlsYCBleGUgKG5vdCB0aGUgc2FtZSBhcyB0aGUgTlNTL01vemlsbGEgY2VydHV0aWwpLiBGaXJlZm94IGRvZXMgaXQnc1xuICAgKiBvd24gdGhpbmcgYXMgdXN1YWwsIGFuZCBnZXR0aW5nIGEgY29weSBvZiBOU1MgY2VydHV0aWwgb250byB0aGUgV2luZG93c1xuICAgKiBtYWNoaW5lIHRvIHRyeSB1cGRhdGluZyB0aGUgRmlyZWZveCBzdG9yZSBpcyBiYXNpY2FsbHkgYSBuaWdodG1hcmUsIHNvIHdlXG4gICAqIGRvbid0IGV2ZW4gdHJ5IGl0IC0gd2UganVzdCBiYWlsIG91dCB0byB0aGUgR1VJLlxuICAgKi9cbiAgYXN5bmMgYWRkVG9UcnVzdFN0b3JlcyhcbiAgICBjZXJ0aWZpY2F0ZVBhdGg6IHN0cmluZyxcbiAgICBvcHRpb25zOiBPcHRpb25zID0ge31cbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8gSUUsIENocm9tZSwgc3lzdGVtIHV0aWxzXG4gICAgZGVidWcoJ2FkZGluZyBkZXZjZXJ0IHJvb3QgdG8gV2luZG93cyBPUyB0cnVzdCBzdG9yZScpO1xuICAgIHRyeSB7XG4gICAgICBydW4oYGNlcnR1dGlsIC1hZGRzdG9yZSAtdXNlciByb290IFwiJHtjZXJ0aWZpY2F0ZVBhdGh9XCJgKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBlLm91dHB1dC5tYXAoKGJ1ZmZlcjogQnVmZmVyKSA9PiB7XG4gICAgICAgIGlmIChidWZmZXIpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhidWZmZXIudG9TdHJpbmcoKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICBkZWJ1ZygnYWRkaW5nIGRldmNlcnQgcm9vdCB0byBGaXJlZm94IHRydXN0IHN0b3JlJyk7XG4gICAgLy8gRmlyZWZveCAoZG9uJ3QgZXZlbiB0cnkgTlNTIGNlcnR1dGlsLCBubyBlYXN5IGluc3RhbGwgZm9yIFdpbmRvd3MpXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IG9wZW5DZXJ0aWZpY2F0ZUluRmlyZWZveCgnc3RhcnQgZmlyZWZveCcsIGNlcnRpZmljYXRlUGF0aCk7XG4gICAgfSBjYXRjaCB7XG4gICAgICBkZWJ1ZygnRXJyb3Igb3BlbmluZyBGaXJlZm94LCBtb3N0IGxpa2VseSBGaXJlZm94IGlzIG5vdCBpbnN0YWxsZWQnKTtcbiAgICB9XG4gIH1cblxuICByZW1vdmVGcm9tVHJ1c3RTdG9yZXMoY2VydGlmaWNhdGVQYXRoOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBkZWJ1ZygncmVtb3ZpbmcgZGV2Y2VydCByb290IGZyb20gV2luZG93cyBPUyB0cnVzdCBzdG9yZScpO1xuICAgIHRyeSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIFwiUmVtb3Zpbmcgb2xkIGNlcnRpZmljYXRlcyBmcm9tIHRydXN0IHN0b3Jlcy4gWW91IG1heSBiZSBwcm9tcHRlZCB0byBncmFudCBwZXJtaXNzaW9uIGZvciB0aGlzLiBJdCdzIHNhZmUgdG8gZGVsZXRlIG9sZCBkZXZjZXJ0IGNlcnRpZmljYXRlcy5cIlxuICAgICAgKTtcbiAgICAgIHJ1bihgY2VydHV0aWwgLWRlbHN0b3JlIC11c2VyIHJvb3QgZGV2Y2VydGApO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGRlYnVnKFxuICAgICAgICBgZmFpbGVkIHRvIHJlbW92ZSAke2NlcnRpZmljYXRlUGF0aH0gZnJvbSBXaW5kb3dzIE9TIHRydXN0IHN0b3JlLCBjb250aW51aW5nLiAke2UudG9TdHJpbmcoKX1gXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGFkZERvbWFpblRvSG9zdEZpbGVJZk1pc3NpbmcoZG9tYWluOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBob3N0c0ZpbGVDb250ZW50cyA9IHJlYWQodGhpcy5IT1NUX0ZJTEVfUEFUSCwgJ3V0ZjgnKTtcbiAgICBpZiAoIWhvc3RzRmlsZUNvbnRlbnRzLmluY2x1ZGVzKGRvbWFpbikpIHtcbiAgICAgIGF3YWl0IHN1ZG8oYGVjaG8gMTI3LjAuMC4xICAke2RvbWFpbn0gPj4gJHt0aGlzLkhPU1RfRklMRV9QQVRIfWApO1xuICAgIH1cbiAgfVxuXG4gIGRlbGV0ZVByb3RlY3RlZEZpbGVzKGZpbGVwYXRoOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBhc3NlcnROb3RUb3VjaGluZ0ZpbGVzKGZpbGVwYXRoLCAnZGVsZXRlJyk7XG4gICAgcmltcmFmKGZpbGVwYXRoKTtcbiAgfVxuXG4gIGFzeW5jIHJlYWRQcm90ZWN0ZWRGaWxlKGZpbGVwYXRoOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGFzc2VydE5vdFRvdWNoaW5nRmlsZXMoZmlsZXBhdGgsICdyZWFkJyk7XG4gICAgaWYgKCFlbmNyeXB0aW9uS2V5KSB7XG4gICAgICBlbmNyeXB0aW9uS2V5ID0gYXdhaXQgVUkuZ2V0V2luZG93c0VuY3J5cHRpb25QYXNzd29yZCgpO1xuICAgIH1cbiAgICAvLyBUcnkgdG8gZGVjcnlwdCB0aGUgZmlsZVxuICAgIHRyeSB7XG4gICAgICByZXR1cm4gdGhpcy5kZWNyeXB0KHJlYWQoZmlsZXBhdGgsICd1dGY4JyksIGVuY3J5cHRpb25LZXkpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIC8vIElmIGl0J3MgYSBiYWQgcGFzc3dvcmQsIGNsZWFyIHRoZSBjYWNoZWQgY29weSBhbmQgcmV0cnlcbiAgICAgIGlmIChlLm1lc3NhZ2UuaW5kZXhPZignYmFkIGRlY3J5cHQnKSA+PSAtMSkge1xuICAgICAgICBlbmNyeXB0aW9uS2V5ID0gbnVsbDtcbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMucmVhZFByb3RlY3RlZEZpbGUoZmlsZXBhdGgpO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH1cblxuICBhc3luYyB3cml0ZVByb3RlY3RlZEZpbGUoZmlsZXBhdGg6IHN0cmluZywgY29udGVudHM6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGFzc2VydE5vdFRvdWNoaW5nRmlsZXMoZmlsZXBhdGgsICd3cml0ZScpO1xuICAgIGlmICghZW5jcnlwdGlvbktleSkge1xuICAgICAgZW5jcnlwdGlvbktleSA9IGF3YWl0IFVJLmdldFdpbmRvd3NFbmNyeXB0aW9uUGFzc3dvcmQoKTtcbiAgICB9XG4gICAgY29uc3QgZW5jcnlwdGVkQ29udGVudHMgPSB0aGlzLmVuY3J5cHQoY29udGVudHMsIGVuY3J5cHRpb25LZXkpO1xuICAgIHdyaXRlKGZpbGVwYXRoLCBlbmNyeXB0ZWRDb250ZW50cyk7XG4gIH1cblxuICBwcml2YXRlIGVuY3J5cHQodGV4dDogc3RyaW5nLCBrZXk6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgY29uc3QgY2lwaGVyID0gY3J5cHRvLmNyZWF0ZUNpcGhlcignYWVzMjU2JywgbmV3IEJ1ZmZlcihrZXkpKTtcbiAgICByZXR1cm4gY2lwaGVyLnVwZGF0ZSh0ZXh0LCAndXRmOCcsICdoZXgnKSArIGNpcGhlci5maW5hbCgnaGV4Jyk7XG4gIH1cblxuICBwcml2YXRlIGRlY3J5cHQoZW5jcnlwdGVkOiBzdHJpbmcsIGtleTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCBkZWNpcGhlciA9IGNyeXB0by5jcmVhdGVEZWNpcGhlcignYWVzMjU2JywgbmV3IEJ1ZmZlcihrZXkpKTtcbiAgICByZXR1cm4gZGVjaXBoZXIudXBkYXRlKGVuY3J5cHRlZCwgJ2hleCcsICd1dGY4JykgKyBkZWNpcGhlci5maW5hbCgndXRmOCcpO1xuICB9XG59XG4iXX0=