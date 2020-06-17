"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const password_prompt_1 = require("password-prompt");
const utils_1 = require("./utils");
const DefaultUI = {
    async getWindowsEncryptionPassword() {
        return await password_prompt_1.default('devcert password (http://bit.ly/devcert-what-password?):');
    },
    warnChromeOnLinuxWithoutCertutil() {
        console.warn(`
      WARNING: It looks like you have Chrome installed, but you specified
      'skipCertutilInstall: true'. Unfortunately, without installing
      certutil, it's impossible get Chrome to trust devcert's certificates
      The certificates will work, but Chrome will continue to warn you that
      they are untrusted.
    `);
    },
    closeFirefoxBeforeContinuing() {
        console.log('Please close Firefox before continuing');
    },
    async startFirefoxWizard(certificateHost) {
        console.log(`
      devcert was unable to automatically configure Firefox. You'll need to
      complete this process manually. Don't worry though - Firefox will walk
      you through it.

      When you're ready, hit any key to continue. Firefox will launch and
      display a wizard to walk you through how to trust the devcert
      certificate. When you are finished, come back here and we'll finish up.

      (If Firefox doesn't start, go ahead and start it and navigate to
      ${certificateHost} in a new tab.)

      If you are curious about why all this is necessary, check out
      https://github.com/davewasmer/devcert#how-it-works

      <Press any key to launch Firefox wizard>
    `);
        await utils_1.waitForUser();
    },
    firefoxWizardPromptPage(certificateURL) {
        return `
      <html>
        <head>
          <meta http-equiv="refresh" content="0; url=${certificateURL}" />
        </head>
      </html>
    `;
    },
    async waitForFirefoxWizard() {
        console.log(`
      Launching Firefox ...

      Great! Once you've finished the Firefox wizard for adding the devcert
      certificate, just hit any key here again and we'll wrap up.

      <Press any key to continue>
    `);
        await utils_1.waitForUser();
    }
};
exports.default = DefaultUI;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlci1pbnRlcmZhY2UuanMiLCJzb3VyY2VSb290IjoiLi8iLCJzb3VyY2VzIjpbInNyYy91c2VyLWludGVyZmFjZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLHFEQUE2QztBQUM3QyxtQ0FBc0M7QUFxQnRDLE1BQU0sU0FBUyxHQUFrQjtJQUMvQixLQUFLLENBQUMsNEJBQTRCO1FBQ2hDLE9BQU8sTUFBTSx5QkFBYyxDQUN6QiwwREFBMEQsQ0FDM0QsQ0FBQztJQUNKLENBQUM7SUFDRCxnQ0FBZ0M7UUFDOUIsT0FBTyxDQUFDLElBQUksQ0FBQzs7Ozs7O0tBTVosQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUNELDRCQUE0QjtRQUMxQixPQUFPLENBQUMsR0FBRyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7SUFDeEQsQ0FBQztJQUNELEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxlQUFlO1FBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQUM7Ozs7Ozs7Ozs7UUFVUixlQUFlOzs7Ozs7S0FNbEIsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxtQkFBVyxFQUFFLENBQUM7SUFDdEIsQ0FBQztJQUNELHVCQUF1QixDQUFDLGNBQXNCO1FBQzVDLE9BQU87Ozt1REFHNEMsY0FBYzs7O0tBR2hFLENBQUM7SUFDSixDQUFDO0lBQ0QsS0FBSyxDQUFDLG9CQUFvQjtRQUN4QixPQUFPLENBQUMsR0FBRyxDQUFDOzs7Ozs7O0tBT1gsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxtQkFBVyxFQUFFLENBQUM7SUFDdEIsQ0FBQztDQUNGLENBQUM7QUFFRixrQkFBZSxTQUFTLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgcGFzc3dvcmRQcm9tcHQgZnJvbSAncGFzc3dvcmQtcHJvbXB0JztcbmltcG9ydCB7IHdhaXRGb3JVc2VyIH0gZnJvbSAnLi91dGlscyc7XG5cbi8qKlxuICogQSByZXByZXNlbnRhdGlvbiBvZiBzZXZlcmFsIHBhcnRzIG9mIHRoZSBsb2NhbCBzeXN0ZW0gdGhhdCB0aGUgdXNlciBpbnRlcmFjdHMgd2l0aFxuICogQHB1YmxpY1xuICovXG5leHBvcnQgaW50ZXJmYWNlIFVzZXJJbnRlcmZhY2Uge1xuICAvKiogR2V0IHRoZSBkaXNrIGVuY3J5cHRpb24gcGFzc3dvcmQgKHdpbmRvd3Mgb25seSkgKi9cbiAgZ2V0V2luZG93c0VuY3J5cHRpb25QYXNzd29yZCgpOiBzdHJpbmcgfCBQcm9taXNlPHN0cmluZz47XG4gIC8qKiBEZWxpdmVyIGEgd2FybmluZyB0byB0aGUgdXNlciB3aXRob3V0IHVzaW5nIGNlcnR1dGlsIChsaW51eCBvbmx5KSAqL1xuICB3YXJuQ2hyb21lT25MaW51eFdpdGhvdXRDZXJ0dXRpbCgpOiB2b2lkIHwgUHJvbWlzZTx2b2lkPjtcbiAgLyoqIENsb3NlIGZpcmVmb3ggKi9cbiAgY2xvc2VGaXJlZm94QmVmb3JlQ29udGludWluZygpOiB2b2lkIHwgUHJvbWlzZTx2b2lkPjtcbiAgLyoqIEJlZ2luIHRoZSBwcm9jZXNzIG9mIGFwcHJvdmluZyBhIGNlcnQgdGhyb3VnaCBmaXJlZml4ICovXG4gIHN0YXJ0RmlyZWZveFdpemFyZChjZXJ0aWZpY2F0ZUhvc3Q6IHN0cmluZyk6IHZvaWQgfCBQcm9taXNlPHZvaWQ+O1xuICAvKiogTG9hZCB0aGUgY2VydCBhcHByb3ZhbCBwYWdlIGluIHRoZSB1c2VyJ3MgbG9jYWwgZmlyZWZveCAqL1xuICBmaXJlZm94V2l6YXJkUHJvbXB0UGFnZShjZXJ0aWZpY2F0ZVVSTDogc3RyaW5nKTogc3RyaW5nIHwgUHJvbWlzZTxzdHJpbmc+O1xuICAvKiogV2FpdCBmb3IgdGhlIHVzZXIgdG8gY29tcGxldGUgdGhlIGZpcmVmb3ggY2VydCBhcHByb3ZhbCB3aXphcmQgKi9cbiAgd2FpdEZvckZpcmVmb3hXaXphcmQoKTogdm9pZCB8IFByb21pc2U8dm9pZD47XG59XG5cbmNvbnN0IERlZmF1bHRVSTogVXNlckludGVyZmFjZSA9IHtcbiAgYXN5bmMgZ2V0V2luZG93c0VuY3J5cHRpb25QYXNzd29yZCgpIHtcbiAgICByZXR1cm4gYXdhaXQgcGFzc3dvcmRQcm9tcHQoXG4gICAgICAnZGV2Y2VydCBwYXNzd29yZCAoaHR0cDovL2JpdC5seS9kZXZjZXJ0LXdoYXQtcGFzc3dvcmQ/KTonXG4gICAgKTtcbiAgfSxcbiAgd2FybkNocm9tZU9uTGludXhXaXRob3V0Q2VydHV0aWwoKSB7XG4gICAgY29uc29sZS53YXJuKGBcbiAgICAgIFdBUk5JTkc6IEl0IGxvb2tzIGxpa2UgeW91IGhhdmUgQ2hyb21lIGluc3RhbGxlZCwgYnV0IHlvdSBzcGVjaWZpZWRcbiAgICAgICdza2lwQ2VydHV0aWxJbnN0YWxsOiB0cnVlJy4gVW5mb3J0dW5hdGVseSwgd2l0aG91dCBpbnN0YWxsaW5nXG4gICAgICBjZXJ0dXRpbCwgaXQncyBpbXBvc3NpYmxlIGdldCBDaHJvbWUgdG8gdHJ1c3QgZGV2Y2VydCdzIGNlcnRpZmljYXRlc1xuICAgICAgVGhlIGNlcnRpZmljYXRlcyB3aWxsIHdvcmssIGJ1dCBDaHJvbWUgd2lsbCBjb250aW51ZSB0byB3YXJuIHlvdSB0aGF0XG4gICAgICB0aGV5IGFyZSB1bnRydXN0ZWQuXG4gICAgYCk7XG4gIH0sXG4gIGNsb3NlRmlyZWZveEJlZm9yZUNvbnRpbnVpbmcoKSB7XG4gICAgY29uc29sZS5sb2coJ1BsZWFzZSBjbG9zZSBGaXJlZm94IGJlZm9yZSBjb250aW51aW5nJyk7XG4gIH0sXG4gIGFzeW5jIHN0YXJ0RmlyZWZveFdpemFyZChjZXJ0aWZpY2F0ZUhvc3QpIHtcbiAgICBjb25zb2xlLmxvZyhgXG4gICAgICBkZXZjZXJ0IHdhcyB1bmFibGUgdG8gYXV0b21hdGljYWxseSBjb25maWd1cmUgRmlyZWZveC4gWW91J2xsIG5lZWQgdG9cbiAgICAgIGNvbXBsZXRlIHRoaXMgcHJvY2VzcyBtYW51YWxseS4gRG9uJ3Qgd29ycnkgdGhvdWdoIC0gRmlyZWZveCB3aWxsIHdhbGtcbiAgICAgIHlvdSB0aHJvdWdoIGl0LlxuXG4gICAgICBXaGVuIHlvdSdyZSByZWFkeSwgaGl0IGFueSBrZXkgdG8gY29udGludWUuIEZpcmVmb3ggd2lsbCBsYXVuY2ggYW5kXG4gICAgICBkaXNwbGF5IGEgd2l6YXJkIHRvIHdhbGsgeW91IHRocm91Z2ggaG93IHRvIHRydXN0IHRoZSBkZXZjZXJ0XG4gICAgICBjZXJ0aWZpY2F0ZS4gV2hlbiB5b3UgYXJlIGZpbmlzaGVkLCBjb21lIGJhY2sgaGVyZSBhbmQgd2UnbGwgZmluaXNoIHVwLlxuXG4gICAgICAoSWYgRmlyZWZveCBkb2Vzbid0IHN0YXJ0LCBnbyBhaGVhZCBhbmQgc3RhcnQgaXQgYW5kIG5hdmlnYXRlIHRvXG4gICAgICAke2NlcnRpZmljYXRlSG9zdH0gaW4gYSBuZXcgdGFiLilcblxuICAgICAgSWYgeW91IGFyZSBjdXJpb3VzIGFib3V0IHdoeSBhbGwgdGhpcyBpcyBuZWNlc3NhcnksIGNoZWNrIG91dFxuICAgICAgaHR0cHM6Ly9naXRodWIuY29tL2RhdmV3YXNtZXIvZGV2Y2VydCNob3ctaXQtd29ya3NcblxuICAgICAgPFByZXNzIGFueSBrZXkgdG8gbGF1bmNoIEZpcmVmb3ggd2l6YXJkPlxuICAgIGApO1xuICAgIGF3YWl0IHdhaXRGb3JVc2VyKCk7XG4gIH0sXG4gIGZpcmVmb3hXaXphcmRQcm9tcHRQYWdlKGNlcnRpZmljYXRlVVJMOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gYFxuICAgICAgPGh0bWw+XG4gICAgICAgIDxoZWFkPlxuICAgICAgICAgIDxtZXRhIGh0dHAtZXF1aXY9XCJyZWZyZXNoXCIgY29udGVudD1cIjA7IHVybD0ke2NlcnRpZmljYXRlVVJMfVwiIC8+XG4gICAgICAgIDwvaGVhZD5cbiAgICAgIDwvaHRtbD5cbiAgICBgO1xuICB9LFxuICBhc3luYyB3YWl0Rm9yRmlyZWZveFdpemFyZCgpIHtcbiAgICBjb25zb2xlLmxvZyhgXG4gICAgICBMYXVuY2hpbmcgRmlyZWZveCAuLi5cblxuICAgICAgR3JlYXQhIE9uY2UgeW91J3ZlIGZpbmlzaGVkIHRoZSBGaXJlZm94IHdpemFyZCBmb3IgYWRkaW5nIHRoZSBkZXZjZXJ0XG4gICAgICBjZXJ0aWZpY2F0ZSwganVzdCBoaXQgYW55IGtleSBoZXJlIGFnYWluIGFuZCB3ZSdsbCB3cmFwIHVwLlxuXG4gICAgICA8UHJlc3MgYW55IGtleSB0byBjb250aW51ZT5cbiAgICBgKTtcbiAgICBhd2FpdCB3YWl0Rm9yVXNlcigpO1xuICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBEZWZhdWx0VUk7XG4iXX0=