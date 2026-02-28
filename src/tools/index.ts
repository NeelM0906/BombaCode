import { ToolRegistry } from "../core/tool-registry.js";
import { ReadTool } from "./read.js";
import { WriteTool } from "./write.js";
import { EditTool } from "./edit.js";
import { BashTool } from "./bash.js";
import { GlobTool } from "./glob.js";
import { GrepTool } from "./grep.js";
import { TodoTool } from "./todo.js";
import { AskUserTool } from "./ask-user.js";

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
