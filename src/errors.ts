export class UnreachableError extends Error {
  constructor(nvr: never, message: string) {
    super(
      `You have encountered a situation that was thought to be impossible\n${message}\nThis value should have been a "never": ${nvr}`
    );
  }
}
