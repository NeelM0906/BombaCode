import type { ToolInvocation } from "../tools/base-tool.js";
import { ToolRegistry } from "./tool-registry.js";

export class ToolRouter {
  constructor(private readonly registry: ToolRegistry) {}

  async run(invocation: ToolInvocation): Promise<string> {
    const tool = this.registry.get(invocation.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${invocation.name}`);
    }
    return tool.run(invocation.input);
  }
}
