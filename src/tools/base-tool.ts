export interface ToolInvocation {
  name: string;
  input: Record<string, unknown>;
}

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract run(input: Record<string, unknown>): Promise<string>;
}
