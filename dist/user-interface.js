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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlci1pbnRlcmZhY2UuanMiLCJzb3VyY2VSb290IjoiLi8iLCJzb3VyY2VzIjpbInVzZXItaW50ZXJmYWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEscURBQTZDO0FBQzdDLG1DQUFzQztBQXFCdEMsTUFBTSxTQUFTLEdBQWtCO0lBQy9CLEtBQUssQ0FBQyw0QkFBNEI7UUFDaEMsT0FBTyxNQUFNLHlCQUFjLENBQ3pCLDBEQUEwRCxDQUMzRCxDQUFDO0lBQ0osQ0FBQztJQUNELGdDQUFnQztRQUM5QixPQUFPLENBQUMsSUFBSSxDQUFDOzs7Ozs7S0FNWixDQUFDLENBQUM7SUFDTCxDQUFDO0lBQ0QsNEJBQTRCO1FBQzFCLE9BQU8sQ0FBQyxHQUFHLENBQUMsd0NBQXdDLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBQ0QsS0FBSyxDQUFDLGtCQUFrQixDQUFDLGVBQWU7UUFDdEMsT0FBTyxDQUFDLEdBQUcsQ0FBQzs7Ozs7Ozs7OztRQVVSLGVBQWU7Ozs7OztLQU1sQixDQUFDLENBQUM7UUFDSCxNQUFNLG1CQUFXLEVBQUUsQ0FBQztJQUN0QixDQUFDO0lBQ0QsdUJBQXVCLENBQUMsY0FBc0I7UUFDNUMsT0FBTzs7O3VEQUc0QyxjQUFjOzs7S0FHaEUsQ0FBQztJQUNKLENBQUM7SUFDRCxLQUFLLENBQUMsb0JBQW9CO1FBQ3hCLE9BQU8sQ0FBQyxHQUFHLENBQUM7Ozs7Ozs7S0FPWCxDQUFDLENBQUM7UUFDSCxNQUFNLG1CQUFXLEVBQUUsQ0FBQztJQUN0QixDQUFDO0NBQ0YsQ0FBQztBQUVGLGtCQUFlLFNBQVMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBwYXNzd29yZFByb21wdCBmcm9tICdwYXNzd29yZC1wcm9tcHQnO1xuaW1wb3J0IHsgd2FpdEZvclVzZXIgfSBmcm9tICcuL3V0aWxzJztcblxuLyoqXG4gKiBBIHJlcHJlc2VudGF0aW9uIG9mIHNldmVyYWwgcGFydHMgb2YgdGhlIGxvY2FsIHN5c3RlbSB0aGF0IHRoZSB1c2VyIGludGVyYWN0cyB3aXRoXG4gKiBAcHVibGljXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgVXNlckludGVyZmFjZSB7XG4gIC8qKiBHZXQgdGhlIGRpc2sgZW5jcnlwdGlvbiBwYXNzd29yZCAod2luZG93cyBvbmx5KSAqL1xuICBnZXRXaW5kb3dzRW5jcnlwdGlvblBhc3N3b3JkKCk6IHN0cmluZyB8IFByb21pc2U8c3RyaW5nPjtcbiAgLyoqIERlbGl2ZXIgYSB3YXJuaW5nIHRvIHRoZSB1c2VyIHdpdGhvdXQgdXNpbmcgY2VydHV0aWwgKGxpbnV4IG9ubHkpICovXG4gIHdhcm5DaHJvbWVPbkxpbnV4V2l0aG91dENlcnR1dGlsKCk6IHZvaWQgfCBQcm9taXNlPHZvaWQ+O1xuICAvKiogQ2xvc2UgZmlyZWZveCAqL1xuICBjbG9zZUZpcmVmb3hCZWZvcmVDb250aW51aW5nKCk6IHZvaWQgfCBQcm9taXNlPHZvaWQ+O1xuICAvKiogQmVnaW4gdGhlIHByb2Nlc3Mgb2YgYXBwcm92aW5nIGEgY2VydCB0aHJvdWdoIGZpcmVmaXggKi9cbiAgc3RhcnRGaXJlZm94V2l6YXJkKGNlcnRpZmljYXRlSG9zdDogc3RyaW5nKTogdm9pZCB8IFByb21pc2U8dm9pZD47XG4gIC8qKiBMb2FkIHRoZSBjZXJ0IGFwcHJvdmFsIHBhZ2UgaW4gdGhlIHVzZXIncyBsb2NhbCBmaXJlZm94ICovXG4gIGZpcmVmb3hXaXphcmRQcm9tcHRQYWdlKGNlcnRpZmljYXRlVVJMOiBzdHJpbmcpOiBzdHJpbmcgfCBQcm9taXNlPHN0cmluZz47XG4gIC8qKiBXYWl0IGZvciB0aGUgdXNlciB0byBjb21wbGV0ZSB0aGUgZmlyZWZveCBjZXJ0IGFwcHJvdmFsIHdpemFyZCAqL1xuICB3YWl0Rm9yRmlyZWZveFdpemFyZCgpOiB2b2lkIHwgUHJvbWlzZTx2b2lkPjtcbn1cblxuY29uc3QgRGVmYXVsdFVJOiBVc2VySW50ZXJmYWNlID0ge1xuICBhc3luYyBnZXRXaW5kb3dzRW5jcnlwdGlvblBhc3N3b3JkKCkge1xuICAgIHJldHVybiBhd2FpdCBwYXNzd29yZFByb21wdChcbiAgICAgICdkZXZjZXJ0IHBhc3N3b3JkIChodHRwOi8vYml0Lmx5L2RldmNlcnQtd2hhdC1wYXNzd29yZD8pOidcbiAgICApO1xuICB9LFxuICB3YXJuQ2hyb21lT25MaW51eFdpdGhvdXRDZXJ0dXRpbCgpIHtcbiAgICBjb25zb2xlLndhcm4oYFxuICAgICAgV0FSTklORzogSXQgbG9va3MgbGlrZSB5b3UgaGF2ZSBDaHJvbWUgaW5zdGFsbGVkLCBidXQgeW91IHNwZWNpZmllZFxuICAgICAgJ3NraXBDZXJ0dXRpbEluc3RhbGw6IHRydWUnLiBVbmZvcnR1bmF0ZWx5LCB3aXRob3V0IGluc3RhbGxpbmdcbiAgICAgIGNlcnR1dGlsLCBpdCdzIGltcG9zc2libGUgZ2V0IENocm9tZSB0byB0cnVzdCBkZXZjZXJ0J3MgY2VydGlmaWNhdGVzXG4gICAgICBUaGUgY2VydGlmaWNhdGVzIHdpbGwgd29yaywgYnV0IENocm9tZSB3aWxsIGNvbnRpbnVlIHRvIHdhcm4geW91IHRoYXRcbiAgICAgIHRoZXkgYXJlIHVudHJ1c3RlZC5cbiAgICBgKTtcbiAgfSxcbiAgY2xvc2VGaXJlZm94QmVmb3JlQ29udGludWluZygpIHtcbiAgICBjb25zb2xlLmxvZygnUGxlYXNlIGNsb3NlIEZpcmVmb3ggYmVmb3JlIGNvbnRpbnVpbmcnKTtcbiAgfSxcbiAgYXN5bmMgc3RhcnRGaXJlZm94V2l6YXJkKGNlcnRpZmljYXRlSG9zdCkge1xuICAgIGNvbnNvbGUubG9nKGBcbiAgICAgIGRldmNlcnQgd2FzIHVuYWJsZSB0byBhdXRvbWF0aWNhbGx5IGNvbmZpZ3VyZSBGaXJlZm94LiBZb3UnbGwgbmVlZCB0b1xuICAgICAgY29tcGxldGUgdGhpcyBwcm9jZXNzIG1hbnVhbGx5LiBEb24ndCB3b3JyeSB0aG91Z2ggLSBGaXJlZm94IHdpbGwgd2Fsa1xuICAgICAgeW91IHRocm91Z2ggaXQuXG5cbiAgICAgIFdoZW4geW91J3JlIHJlYWR5LCBoaXQgYW55IGtleSB0byBjb250aW51ZS4gRmlyZWZveCB3aWxsIGxhdW5jaCBhbmRcbiAgICAgIGRpc3BsYXkgYSB3aXphcmQgdG8gd2FsayB5b3UgdGhyb3VnaCBob3cgdG8gdHJ1c3QgdGhlIGRldmNlcnRcbiAgICAgIGNlcnRpZmljYXRlLiBXaGVuIHlvdSBhcmUgZmluaXNoZWQsIGNvbWUgYmFjayBoZXJlIGFuZCB3ZSdsbCBmaW5pc2ggdXAuXG5cbiAgICAgIChJZiBGaXJlZm94IGRvZXNuJ3Qgc3RhcnQsIGdvIGFoZWFkIGFuZCBzdGFydCBpdCBhbmQgbmF2aWdhdGUgdG9cbiAgICAgICR7Y2VydGlmaWNhdGVIb3N0fSBpbiBhIG5ldyB0YWIuKVxuXG4gICAgICBJZiB5b3UgYXJlIGN1cmlvdXMgYWJvdXQgd2h5IGFsbCB0aGlzIGlzIG5lY2Vzc2FyeSwgY2hlY2sgb3V0XG4gICAgICBodHRwczovL2dpdGh1Yi5jb20vZGF2ZXdhc21lci9kZXZjZXJ0I2hvdy1pdC13b3Jrc1xuXG4gICAgICA8UHJlc3MgYW55IGtleSB0byBsYXVuY2ggRmlyZWZveCB3aXphcmQ+XG4gICAgYCk7XG4gICAgYXdhaXQgd2FpdEZvclVzZXIoKTtcbiAgfSxcbiAgZmlyZWZveFdpemFyZFByb21wdFBhZ2UoY2VydGlmaWNhdGVVUkw6IHN0cmluZykge1xuICAgIHJldHVybiBgXG4gICAgICA8aHRtbD5cbiAgICAgICAgPGhlYWQ+XG4gICAgICAgICAgPG1ldGEgaHR0cC1lcXVpdj1cInJlZnJlc2hcIiBjb250ZW50PVwiMDsgdXJsPSR7Y2VydGlmaWNhdGVVUkx9XCIgLz5cbiAgICAgICAgPC9oZWFkPlxuICAgICAgPC9odG1sPlxuICAgIGA7XG4gIH0sXG4gIGFzeW5jIHdhaXRGb3JGaXJlZm94V2l6YXJkKCkge1xuICAgIGNvbnNvbGUubG9nKGBcbiAgICAgIExhdW5jaGluZyBGaXJlZm94IC4uLlxuXG4gICAgICBHcmVhdCEgT25jZSB5b3UndmUgZmluaXNoZWQgdGhlIEZpcmVmb3ggd2l6YXJkIGZvciBhZGRpbmcgdGhlIGRldmNlcnRcbiAgICAgIGNlcnRpZmljYXRlLCBqdXN0IGhpdCBhbnkga2V5IGhlcmUgYWdhaW4gYW5kIHdlJ2xsIHdyYXAgdXAuXG5cbiAgICAgIDxQcmVzcyBhbnkga2V5IHRvIGNvbnRpbnVlPlxuICAgIGApO1xuICAgIGF3YWl0IHdhaXRGb3JVc2VyKCk7XG4gIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IERlZmF1bHRVSTtcbiJdfQ==