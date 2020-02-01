declare module "command-exists";
declare module "eol";
declare module "sudo-prompt";
declare module "password-prompt";
declare module "application-config-path" {
  function f(appName: string): string;
  export = f;
}
