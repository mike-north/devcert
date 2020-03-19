// ES6 Module export
// see: https://www.typescriptlang.org/docs/handbook/declaration-files/templates/module-function-d-ts.html
export = prompt;
declare function prompt(
  ask: string,
  options?: {
    method: 'hide' | 'mask';
    required: boolean;
    default?: string;
  }
): Promise<string>;
