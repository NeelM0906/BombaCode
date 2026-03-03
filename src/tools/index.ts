import { ToolRegistry } from "../core/tool-registry.js";
import { ReadTool } from "./read.js";
import { WriteTool } from "./write.js";
import { EditTool } from "./edit.js";
import { BashTool } from "./bash.js";
import { GlobTool } from "./glob.js";
import { GrepTool } from "./grep.js";
import { TodoTool } from "./todo.js";
import { AskUserTool } from "./ask-user.js";
import { TaskTool } from "./task.js";
import type { TaskToolConfig } from "./task.js";
import type { Tool } from "./base-tool.js";

export function registerBuiltinTools(registry: ToolRegistry, cwd: string): void {
  registry.register(new ReadTool());
  registry.register(new WriteTool());
  registry.register(new EditTool());
  registry.register(new BashTool(cwd));
  registry.register(new GlobTool());
  registry.register(new GrepTool());
  registry.register(new TodoTool());
  registry.register(new AskUserTool());
}

/**
 * Register all built-in tools including the task (sub-agent) tool.
 * The task tool requires additional configuration for spawning sub-agents.
 */
export function registerAllTools(
  registry: ToolRegistry,
  cwd: string,
  taskConfig: TaskToolConfig
): void {
  registerBuiltinTools(registry, cwd);
  registry.register(new TaskTool(taskConfig));
}

/**
 * Collect all registered tools into an array (used by TaskTool for sub-agent tool assignment).
 */
export function collectAllTools(registry: ToolRegistry): Tool[] {
  return registry.getAllTools();
}
