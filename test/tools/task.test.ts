import { describe, expect, it } from "vitest";
import { TaskTool, autoAssignTools, classifyTask } from "../../src/tools/task.js";
import type { TaskToolConfig } from "../../src/tools/task.js";
import { BaseTool } from "../../src/tools/base-tool.js";
import type { ToolExecuteResult } from "../../src/tools/base-tool.js";
import { CostTracker } from "../../src/llm/cost-tracker.js";
import type { LLMProvider, LLMRequest, LLMResponse, StreamEvent } from "../../src/llm/types.js";

// ─── Fake Tools ───

class FakeReadTool extends BaseTool {
  name = "read";
  description = "read files";
  category = "readonly" as const;
  inputSchema = { type: "object", properties: {} };
  async run(): Promise<ToolExecuteResult> {
    return { content: "file content", isError: false };
  }
}

class FakeWriteTool extends BaseTool {
  name = "write";
  description = "write files";
  category = "write" as const;
  inputSchema = { type: "object", properties: {} };
  async run(): Promise<ToolExecuteResult> {
    return { content: "written", isError: false };
  }
}

class FakeEditTool extends BaseTool {
  name = "edit";
  description = "edit files";
  category = "write" as const;
  inputSchema = { type: "object", properties: {} };
  async run(): Promise<ToolExecuteResult> {
    return { content: "edited", isError: false };
  }
}

class FakeBashTool extends BaseTool {
  name = "bash";
  description = "run commands";
  category = "execute" as const;
  inputSchema = { type: "object", properties: {} };
  async run(): Promise<ToolExecuteResult> {
    return { content: "exit 0", isError: false };
  }
}

class FakeGlobTool extends BaseTool {
  name = "glob";
  description = "find files";
  category = "readonly" as const;
  inputSchema = { type: "object", properties: {} };
  async run(): Promise<ToolExecuteResult> {
    return { content: "files found", isError: false };
  }
}

class FakeGrepTool extends BaseTool {
  name = "grep";
  description = "search in files";
  category = "readonly" as const;
  inputSchema = { type: "object", properties: {} };
  async run(): Promise<ToolExecuteResult> {
    return { content: "matches", isError: false };
  }
}

class FakeTodoTool extends BaseTool {
  name = "todo";
  description = "manage todos";
  category = "interactive" as const;
  inputSchema = { type: "object", properties: {} };
  async run(): Promise<ToolExecuteResult> {
    return { content: "todos updated", isError: false };
  }
}

class FakeAskUserTool extends BaseTool {
  name = "ask_user";
  description = "ask user";
  category = "interactive" as const;
  inputSchema = { type: "object", properties: {} };
  async run(): Promise<ToolExecuteResult> {
    return { content: "user replied", isError: false };
  }
}

class FakeWebSearchTool extends BaseTool {
  name = "web-search";
  description = "search the web";
  category = "readonly" as const;
  inputSchema = { type: "object", properties: {} };
  async run(): Promise<ToolExecuteResult> {
    return { content: "search results", isError: false };
  }
}

class FakeWebFetchTool extends BaseTool {
  name = "web-fetch";
  description = "fetch URL";
  category = "readonly" as const;
  inputSchema = { type: "object", properties: {} };
  async run(): Promise<ToolExecuteResult> {
    return { content: "fetched content", isError: false };
  }
}

function allFakeTools() {
  return [
    new FakeReadTool(),
    new FakeWriteTool(),
    new FakeEditTool(),
    new FakeBashTool(),
    new FakeGlobTool(),
    new FakeGrepTool(),
    new FakeTodoTool(),
    new FakeAskUserTool(),
    new FakeWebSearchTool(),
    new FakeWebFetchTool(),
  ];
}

// ─── Fake LLM Provider ───

class FakeProvider implements LLMProvider {
  name = "fake";
  responseText: string;
  shouldError: boolean;

  constructor(responseText = "Task completed successfully.", shouldError = false) {
    this.responseText = responseText;
    this.shouldError = shouldError;
  }

  supportsTools(): boolean {
    return true;
  }
  supportsThinking(): boolean {
    return false;
  }
  supportsCaching(): boolean {
    return false;
  }
  estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
  }

  async createMessage(_request: LLMRequest): Promise<LLMResponse> {
    return {
      content: this.responseText,
      toolCalls: [],
      stopReason: "end_turn",
      usage: { inputTokens: 10, outputTokens: 5 },
    };
  }

  async *streamMessage(_request: LLMRequest): AsyncGenerator<StreamEvent> {
    if (this.shouldError) {
      yield { type: "error", error: "Provider exploded" };
      return;
    }
    yield { type: "text_delta", content: this.responseText };
    yield { type: "usage", usage: { inputTokens: 10, outputTokens: 5 } };
    yield { type: "done", stopReason: "end_turn" };
  }

  getMaxContextTokens(): number {
    return 100_000;
  }
}

// ─── Helper ───

function makeConfig(overrides: Partial<TaskToolConfig> = {}): TaskToolConfig {
  return {
    costTracker: new CostTracker(),
    provider: new FakeProvider(),
    model: "test-model",
    parentTools: allFakeTools(),
    currentDepth: 0,
    ...overrides,
  };
}

// ─── Tests ───

describe("classifyTask", () => {
  it("classifies read-only tasks", () => {
    expect(classifyTask("search for all TypeScript files")).toBe("readonly");
    expect(classifyTask("find the main entry point")).toBe("readonly");
    expect(classifyTask("read the configuration file")).toBe("readonly");
    expect(classifyTask("explore the project structure")).toBe("readonly");
    expect(classifyTask("understand how the auth module works")).toBe("readonly");
    expect(classifyTask("analyze the code complexity")).toBe("readonly");
  });

  it("classifies research tasks", () => {
    expect(classifyTask("research best practices for error handling")).toBe("research");
    expect(classifyTask("look up the API documentation")).toBe("research");
    expect(classifyTask("fetch the latest release notes from web")).toBe("research");
  });

  it("classifies write/modification tasks", () => {
    expect(classifyTask("write a new test file")).toBe("write");
    expect(classifyTask("edit the configuration")).toBe("write");
    expect(classifyTask("fix the broken import")).toBe("write");
    expect(classifyTask("implement the new feature")).toBe("write");
    expect(classifyTask("create a helper function")).toBe("write");
    expect(classifyTask("refactor the database module")).toBe("write");
    expect(classifyTask("update the version number")).toBe("write");
    expect(classifyTask("add logging to the handler")).toBe("write");
    expect(classifyTask("remove the deprecated function")).toBe("write");
    expect(classifyTask("delete the unused import")).toBe("write");
    expect(classifyTask("modify the response format")).toBe("write");
  });

  it("returns default for unclear descriptions", () => {
    expect(classifyTask("do something with the project")).toBe("default");
    expect(classifyTask("handle the deployment")).toBe("default");
  });

  it("prioritizes write over research/readonly when both match", () => {
    // "fix" is a write keyword, even though "find" is readonly
    expect(classifyTask("find and fix the bug")).toBe("write");
    // "update" is a write keyword
    expect(classifyTask("research and update the docs")).toBe("write");
  });
});

describe("autoAssignTools", () => {
  const tools = allFakeTools();

  it("assigns read-only tools for search tasks", () => {
    const assigned = autoAssignTools("search for all TypeScript files", tools, 0, 5);
    const names = assigned.map((t) => t.name);

    expect(names).toContain("read");
    expect(names).toContain("glob");
    expect(names).toContain("grep");
    expect(names).toContain("todo");
    expect(names).toContain("ask_user");
    expect(names).not.toContain("write");
    expect(names).not.toContain("edit");
    expect(names).not.toContain("bash");
  });

  it("assigns research tools for research tasks", () => {
    const assigned = autoAssignTools("research the API documentation", tools, 0, 5);
    const names = assigned.map((t) => t.name);

    expect(names).toContain("read");
    expect(names).toContain("glob");
    expect(names).toContain("grep");
    expect(names).toContain("web-search");
    expect(names).toContain("web-fetch");
    expect(names).toContain("todo");
    expect(names).toContain("ask_user");
    expect(names).not.toContain("write");
    expect(names).not.toContain("bash");
  });

  it("assigns all tools for write tasks", () => {
    const assigned = autoAssignTools("implement the new endpoint", tools, 0, 5);
    const names = assigned.map((t) => t.name);

    expect(names).toContain("read");
    expect(names).toContain("write");
    expect(names).toContain("edit");
    expect(names).toContain("bash");
    expect(names).toContain("glob");
    expect(names).toContain("grep");
    expect(names).toContain("todo");
    expect(names).toContain("ask_user");
  });

  it("assigns all tools for default/unclear tasks", () => {
    const assigned = autoAssignTools("do something", tools, 0, 5);
    const names = assigned.map((t) => t.name);

    expect(names).toContain("read");
    expect(names).toContain("write");
    expect(names).toContain("edit");
    expect(names).toContain("bash");
  });

  it("includes task tool when not at depth limit", () => {
    // Add a fake task tool to the list
    const taskTool = new TaskTool(makeConfig());
    const toolsWithTask = [...tools, taskTool];

    const assigned = autoAssignTools("implement something", toolsWithTask, 0, 5);
    const names = assigned.map((t) => t.name);

    expect(names).toContain("task");
  });

  it("excludes task tool at depth limit", () => {
    const taskTool = new TaskTool(makeConfig());
    const toolsWithTask = [...tools, taskTool];

    // depth 5, maxDepth 5 => at depth limit
    const assigned = autoAssignTools("implement something", toolsWithTask, 5, 5);
    const names = assigned.map((t) => t.name);

    expect(names).not.toContain("task");
  });

  it("excludes task tool from readonly tasks at depth limit", () => {
    const taskTool = new TaskTool(makeConfig());
    const toolsWithTask = [...tools, taskTool];

    const assigned = autoAssignTools("search for files", toolsWithTask, 5, 5);
    const names = assigned.map((t) => t.name);

    expect(names).not.toContain("task");
  });

  it("always includes todo and ask_user regardless of category", () => {
    const assigned = autoAssignTools("search for files", tools, 0, 5);
    const names = assigned.map((t) => t.name);

    expect(names).toContain("todo");
    expect(names).toContain("ask_user");
  });
});

describe("TaskTool", () => {
  it("returns error for empty description", async () => {
    const tool = new TaskTool(makeConfig());
    const result = await tool.execute({ description: "" });

    expect(result.isError).toBe(true);
    expect(result.content).toContain("Missing required field");
  });

  it("returns error for missing description", async () => {
    const tool = new TaskTool(makeConfig());
    const result = await tool.execute({});

    expect(result.isError).toBe(true);
    expect(result.content).toContain("Missing required field");
  });

  it("returns error when max depth exceeded", async () => {
    const tool = new TaskTool(makeConfig({ currentDepth: 5 }));
    const result = await tool.execute({ description: "do something" });

    expect(result.isError).toBe(true);
    expect(result.content).toContain("Maximum sub-agent depth");
  });

  it("spawns a sub-agent and returns its response", async () => {
    const costTracker = new CostTracker();
    const provider = new FakeProvider("Sub-agent result text.");

    const tool = new TaskTool(
      makeConfig({
        costTracker,
        provider,
        model: "test-model",
        currentDepth: 0,
      })
    );

    const result = await tool.execute({ description: "analyze the codebase" });

    expect(result.isError).toBe(false);
    expect(result.content).toContain("Sub-agent result text.");
    // Cost tracker should have recorded usage from the sub-agent
    expect(costTracker.getTotalTokens()).toBeGreaterThan(0);
  });

  it("uses default maxTurns when not specified", async () => {
    const provider = new FakeProvider("Done.");
    const tool = new TaskTool(makeConfig({ provider }));

    const result = await tool.execute({ description: "analyze something" });

    expect(result.isError).toBe(false);
    expect(result.content).toContain("Done.");
  });

  it("respects custom maxTurns", async () => {
    const provider = new FakeProvider("Done.");
    const tool = new TaskTool(makeConfig({ provider }));

    const result = await tool.execute({ description: "analyze something", maxTurns: 3 });

    expect(result.isError).toBe(false);
    expect(result.content).toContain("Done.");
  });

  it("handles sub-agent errors gracefully without crashing", async () => {
    // Create a provider that throws during stream
    const errorProvider: LLMProvider = {
      name: "error-provider",
      supportsTools: () => true,
      supportsThinking: () => false,
      supportsCaching: () => false,
      estimateTokens: (text: string) => Math.ceil(text.length / 4),
      createMessage: async () => {
        throw new Error("Provider crashed");
      },
      async *streamMessage() {
        yield { type: "error" as const, error: "Provider crashed" };
      },
      getMaxContextTokens: () => 100_000,
    };

    const tool = new TaskTool(
      makeConfig({
        provider: errorProvider,
      })
    );

    // Should not throw; should return an error result
    const result = await tool.execute({ description: "do something" });

    // The tool should catch the error and return it as a tool result
    // The error from the stream propagates through AgentLoop
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Sub-agent error");
  });

  it("shares cost tracker between parent and sub-agent", async () => {
    const costTracker = new CostTracker();
    const provider = new FakeProvider("Completed.");

    const tool = new TaskTool(
      makeConfig({
        costTracker,
        provider,
        currentDepth: 0,
      })
    );

    expect(costTracker.getTotalTokens()).toBe(0);

    await tool.execute({ description: "analyze something" });

    // The sub-agent should have added tokens to the shared tracker
    expect(costTracker.getTotalTokens()).toBeGreaterThan(0);
  });

  it("increments depth for sub-agent task tools", async () => {
    // Create a provider that attempts to spawn sub-agents recursively
    let callCount = 0;
    const countingProvider: LLMProvider = {
      name: "counting",
      supportsTools: () => true,
      supportsThinking: () => false,
      supportsCaching: () => false,
      estimateTokens: (text: string) => Math.ceil(text.length / 4),
      createMessage: async () => ({
        content: "done",
        toolCalls: [],
        stopReason: "end_turn" as const,
        usage: { inputTokens: 5, outputTokens: 5 },
      }),
      async *streamMessage() {
        callCount++;
        yield { type: "text_delta" as const, content: `Response ${callCount}` };
        yield { type: "usage" as const, usage: { inputTokens: 5, outputTokens: 5 } };
        yield { type: "done" as const, stopReason: "end_turn" as const };
      },
      getMaxContextTokens: () => 100_000,
    };

    // Sub-agent at depth 4 should be able to include task tool (next depth = 5 = max, so it CAN still spawn)
    const tool = new TaskTool(
      makeConfig({
        provider: countingProvider,
        currentDepth: 4,
      })
    );

    const result = await tool.execute({ description: "do something" });
    expect(result.isError).toBe(false);
    // depth is 4, next depth is 5 which equals MAX_DEPTH, so depth >= MAX_DEPTH check prevents spawning
    // Actually check: nextDepth = 5, MAX_DEPTH = 5, nextDepth > MAX_DEPTH is false, so it spawns fine
    expect(result.content).toContain("Response");
  });

  it("returns fallback message when sub-agent produces empty output", async () => {
    const emptyProvider: LLMProvider = {
      name: "empty",
      supportsTools: () => true,
      supportsThinking: () => false,
      supportsCaching: () => false,
      estimateTokens: (text: string) => Math.ceil(text.length / 4),
      createMessage: async () => ({
        content: "",
        toolCalls: [],
        stopReason: "end_turn" as const,
        usage: { inputTokens: 5, outputTokens: 0 },
      }),
      async *streamMessage() {
        yield { type: "usage" as const, usage: { inputTokens: 5, outputTokens: 0 } };
        yield { type: "done" as const, stopReason: "end_turn" as const };
      },
      getMaxContextTokens: () => 100_000,
    };

    const tool = new TaskTool(makeConfig({ provider: emptyProvider }));
    const result = await tool.execute({ description: "produce nothing" });

    expect(result.isError).toBe(false);
    expect(result.content).toBe("Sub-agent completed without producing output.");
  });

  it("uses model override when createProvider is available", async () => {
    let usedModel = "";
    const overrideProvider = new FakeProvider("Done with override.");
    const tool = new TaskTool(
      makeConfig({
        model: "expensive-model",
        createProvider: (model: string) => {
          usedModel = model;
          return overrideProvider;
        },
      })
    );

    const result = await tool.execute({
      description: "do something",
      model: "cheap-model",
    });

    expect(result.isError).toBe(false);
    expect(usedModel).toBe("cheap-model");
    expect(result.content).toContain("Done with override.");
  });

  it("uses parent provider when no createProvider is available and model override given", async () => {
    const parentProvider = new FakeProvider("Parent provider used.");
    const tool = new TaskTool(
      makeConfig({
        provider: parentProvider,
        model: "default-model",
        // No createProvider
      })
    );

    const result = await tool.execute({
      description: "do something",
      model: "another-model",
    });

    // Falls back to parent provider since createProvider is not set
    expect(result.isError).toBe(false);
    expect(result.content).toContain("Parent provider used.");
  });

  it("has correct tool metadata", () => {
    const tool = new TaskTool(makeConfig());
    expect(tool.name).toBe("task");
    expect(tool.category).toBe("execute");
    expect(tool.description).toContain("sub-agent");
    expect(tool.inputSchema.required).toEqual(["description"]);
  });

  it("setParentTools updates available tools", async () => {
    const tool = new TaskTool(makeConfig({ parentTools: [] }));

    // Initially no parent tools
    const result1 = await tool.execute({ description: "search for files" });
    expect(result1.isError).toBe(false);

    // Update parent tools
    tool.setParentTools(allFakeTools());

    const result2 = await tool.execute({ description: "search for files" });
    expect(result2.isError).toBe(false);
  });
});

describe("TaskTool depth limiting", () => {
  it("blocks spawning at depth 5", async () => {
    const tool = new TaskTool(makeConfig({ currentDepth: 5 }));
    const result = await tool.execute({ description: "try to spawn" });

    expect(result.isError).toBe(true);
    expect(result.content).toContain("Maximum sub-agent depth (5) reached");
  });

  it("allows spawning at depth 4", async () => {
    const provider = new FakeProvider("Depth 4 result.");
    const tool = new TaskTool(makeConfig({ provider, currentDepth: 4 }));
    const result = await tool.execute({ description: "do work at depth 4" });

    expect(result.isError).toBe(false);
    expect(result.content).toContain("Depth 4 result.");
  });

  it("allows spawning at depth 0", async () => {
    const provider = new FakeProvider("Top level result.");
    const tool = new TaskTool(makeConfig({ provider, currentDepth: 0 }));
    const result = await tool.execute({ description: "do work at depth 0" });

    expect(result.isError).toBe(false);
    expect(result.content).toContain("Top level result.");
  });
});
