export = prompt;
declare function prompt(
  ask: string,
  options?: {
    method: 'hide' | 'mask';
    required: boolean;
    default?: string;
  }
): Promise<string>;
