declare namespace sudoPrompt {
  interface Options {
    name: string;
  }
  export function exec(
    cmd: string,
    opts: Options,
    cb: (
      err: Error | null,
      stdout: string | null,
      stderr: string | null
    ) => void
  ): void;
}

export default sudoPrompt;
