import { BaseTool } from "./base-tool.js";
import type { ToolInput, ToolExecuteResult, Tool } from "./base-tool.js";
import { AgentLoop } from "../core/agent-loop.js";
import { MessageManager } from "../core/message-manager.js";
import { ToolRegistry } from "../core/tool-registry.js";
import { ToolRouter } from "../core/tool-router.js";
import { PermissionManager } from "../core/permission-manager.js";
import { CheckpointManager } from "../core/checkpoint-manager.js";
import type { CostTracker } from "../llm/cost-tracker.js";
import type { LLMProvider } from "../llm/types.js";
import { logger } from "../utils/logger.js";

const MAX_DEPTH = 5;
const DEFAULT_MAX_TURNS = 15;

/** Keyword patterns for auto-assigning tool subsets */
const READONLY_KEYWORDS = ["search", "find", "read", "explore", "understand", "analyze"];
const RESEARCH_KEYWORDS = ["research", "look up", "fetch", "web"];
const WRITE_KEYWORDS = [
  "write", "edit", "fix", "implement", "create", "refactor",
  "update", "add", "remove", "delete", "modify",
];

export type TaskCategory = "readonly" | "research" | "write" | "default";

/**
 * Analyze a task description and classify it into a category for tool assignment.
 */
export function classifyTask(description: string): TaskCategory {
  const lower = description.toLowerCase();

  // Check write/modification keywords first (most permissive)
  if (WRITE_KEYWORDS.some((kw) => lower.includes(kw))) {
    return "write";
  }

  // Check research keywords
  if (RESEARCH_KEYWORDS.some((kw) => lower.includes(kw))) {
    return "research";
  }

  // Check read-only keywords
  if (READONLY_KEYWORDS.some((kw) => lower.includes(kw))) {
    return "readonly";
  }

  // Default: give broad access
  return "default";
}

/**
 * Auto-assign tools based on the task description, current depth, and available tools.
 */
export function autoAssignTools(
  description: string,
  availableTools: Tool[],
  currentDepth: number,
  maxDepth: number
): Tool[] {
  const category = classifyTask(description);
  const toolMap = new Map(availableTools.map((t) => [t.name, t]));
  const atDepthLimit = currentDepth >= maxDepth;

  const selected = new Set<string>();
  const result: Tool[] = [];

  const addIfExists = (name: string): void => {
    if (selected.has(name)) return;
    const tool = toolMap.get(name);
    if (tool) {
      selected.add(name);
      result.push(tool);
    }
  };

  // Always include utility tools
  addIfExists("todo");
  addIfExists("ask_user");

  switch (category) {
    case "readonly":
      addIfExists("read");
      addIfExists("glob");
      addIfExists("grep");
      break;
    case "research":
      addIfExists("read");
      addIfExists("glob");
      addIfExists("grep");
      addIfExists("web_search");
      addIfExists("web_fetch");
      // Also try hyphenated names used in the codebase
      addIfExists("web-search");
      addIfExists("web-fetch");
      break;
    case "write":
    case "default":
      // Give access to all tools except task (if at depth limit)
      for (const tool of availableTools) {
        if (tool.name === "task" && atDepthLimit) continue;
        addIfExists(tool.name);
      }
      break;
  }

  // For readonly/research: add task tool if not at depth limit
  if (category !== "write" && category !== "default" && !atDepthLimit) {
    addIfExists("task");
  }

  return result;
}

/**
 * Build a scoped system prompt for sub-agents (shorter and task-focused).
 */
function buildSubAgentSystemPrompt(description: string, depth: number): string {
  return `You are a sub-agent of BombaCode, a terminal-native coding agent. You have been spawned to complete a specific task.

# Your Task
${description}

# Instructions
- Focus exclusively on the task described above. Do not deviate.
- Use your available tools to complete the task efficiently.
- Be thorough but concise. When done, provide a clear summary of what you accomplished.
- If you cannot complete the task, explain what blocked you and what was attempted.
- Do not ask the user for clarification unless absolutely necessary.
- Match existing code conventions when making changes.
- Always read files before editing them.

# Context
- You are a sub-agent at depth ${depth}/${MAX_DEPTH}.
- Your conversation is isolated; you cannot see the parent agent's history.
- Complete your work and report back. The parent agent will use your response.`;
}

export interface TaskToolConfig {
  costTracker: CostTracker;
  provider: LLMProvider;
  model: string;
  parentTools: Tool[];
  currentDepth?: number;
  /** Factory for creating sub-agent LLM providers with a different model */
  createProvider?: (model: string) => LLMProvider;
}

export class TaskTool extends BaseTool {
  readonly name = "task";
  readonly description = [
    "Spawn a sub-agent to perform a task autonomously.",
    "The sub-agent gets its own conversation context and a subset of tools auto-assigned based on the task description.",
    "Use this to delegate work: research, code analysis, file modifications, or multi-step operations.",
    "Multiple task calls in the same turn execute in parallel.",
    "Sub-agents can spawn their own sub-agents up to a maximum depth of 5.",
  ].join(" ");
  readonly category = "execute" as const;
  readonly inputSchema = {
    type: "object",
    properties: {
      description: {
        type: "string",
        description: "What the sub-agent should do. This becomes its initial prompt.",
      },
      model: {
        type: "string",
        description: "Optional model override for the sub-agent (e.g., use a cheaper model).",
      },
      maxTurns: {
        type: "number",
        description: "Maximum agentic turns for the sub-agent (default 15).",
      },
    },
    required: ["description"],
    additionalProperties: false,
  };

  private config: TaskToolConfig;

  constructor(config: TaskToolConfig) {
    super();
    this.config = config;
  }

  /**
   * Update the parent tools list. Called after all tools are registered
   * to resolve the circular dependency (task tool needs the full tool list,
   * but the tool list includes the task tool).
   */
  setParentTools(tools: Tool[]): void {
    this.config = { ...this.config, parentTools: tools };
  }

  async run(input: ToolInput): Promise<ToolExecuteResult> {
    const description = typeof input.description === "string" ? input.description.trim() : "";
    if (!description) {
      return { content: "Error: Missing required field 'description'.", isError: true };
    }

    const currentDepth = this.config.currentDepth ?? 0;
    const nextDepth = currentDepth + 1;

    if (nextDepth > MAX_DEPTH) {
      return {
        content: `Error: Maximum sub-agent depth (${MAX_DEPTH}) reached. Cannot spawn further sub-agents.`,
        isError: true,
      };
    }

    const maxTurns =
      typeof input.maxTurns === "number" && Number.isFinite(input.maxTurns) && input.maxTurns > 0
        ? Math.floor(input.maxTurns)
        : DEFAULT_MAX_TURNS;

    const modelOverride = typeof input.model === "string" ? input.model.trim() : "";
    const subModel = modelOverride || this.config.model;
    const subProvider =
      modelOverride && this.config.createProvider
        ? this.config.createProvider(modelOverride)
        : this.config.provider;

    try {
      // Auto-assign tools for the sub-agent
      const assignedTools = autoAssignTools(
        description,
        this.config.parentTools,
        nextDepth,
        MAX_DEPTH
      );

      // Rebuild task tools in the assigned set so they carry the new depth
      const subTools = assignedTools.map((tool) => {
        if (tool.name === "task") {
          return new TaskTool({
            ...this.config,
            currentDepth: nextDepth,
            model: subModel,
            provider: subProvider,
            parentTools: this.config.parentTools,
          });
        }
        return tool;
      });

      // Build isolated infrastructure for the sub-agent
      const subMessageManager = new MessageManager();
      const subRegistry = new ToolRegistry();
      for (const tool of subTools) {
        subRegistry.register(tool);
      }

      const subRouter = new ToolRouter({
        registry: subRegistry,
        permissionManager: new PermissionManager("yolo"),
        checkpointManager: new CheckpointManager(),
      });

      const systemPrompt = buildSubAgentSystemPrompt(description, nextDepth);

      const subLoop = new AgentLoop({
        messageManager: subMessageManager,
        provider: subProvider,
        costTracker: this.config.costTracker, // shared cost tracker
        model: subModel,
        systemPrompt,
        maxTokens: 16_384,
        maxTurns,
        toolRegistry: subRegistry,
        toolRouter: subRouter,
      });

      logger.info("Spawning sub-agent", {
        depth: nextDepth,
        model: subModel,
        maxTurns,
        tools: subTools.map((t) => t.name),
        category: classifyTask(description),
      });

      const result = await subLoop.processUserInput(description);

      // Extract the meaningful final response
      const finalResponse = result.trim() || "Sub-agent completed without producing output.";

      logger.info("Sub-agent completed", {
        depth: nextDepth,
        responseLength: finalResponse.length,
      });

      return { content: finalResponse, isError: false };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Sub-agent failed", { depth: nextDepth, error: message });
      return {
        content: `Sub-agent error: ${message}`,
        isError: true,
      };
    }
  }
}
