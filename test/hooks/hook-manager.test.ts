import { describe, it, expect, vi, beforeEach } from "vitest";
import { HookManager } from "../../src/hooks/hook-manager.js";
import type { HookContext, HookHandler, HookResult } from "../../src/hooks/types.js";
import type { Settings } from "../../src/memory/settings.js";
import { createAutoLintHook } from "../../src/hooks/built-in/auto-lint.js";

// Mock child_process for shell command tests
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";

const mockedExecFile = vi.mocked(execFile);

function makeSettings(hooks: Settings["hooks"] = {}): Settings {
  return {
    provider: "openrouter",
    openAICompatBaseUrl: "http://localhost:4000/v1",
    defaultModel: "anthropic/claude-sonnet-4-6",
    models: {
      fast: "anthropic/claude-haiku-4-5",
      balanced: "anthropic/claude-sonnet-4-6",
      powerful: "anthropic/claude-opus-4-6",
    },
    costMode: "balanced",
    maxTokenBudget: null,
    autoCompactAt: 0.85,
    permissions: { mode: "normal", customRules: [] },
    mcpServers: {},
    hooks,
  };
}

describe("HookManager", () => {
  let hookManager: HookManager;

  beforeEach(() => {
    hookManager = new HookManager();
    vi.clearAllMocks();
  });

  describe("register and run", () => {
    it("should register and fire a handler for an event", async () => {
      const handler = vi.fn<HookHandler>().mockResolvedValue(undefined);

      hookManager.register("post_tool_use", handler);
      await hookManager.run("post_tool_use", { toolName: "read" });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "post_tool_use",
          toolName: "read",
        })
      );
    });

    it("should fire multiple handlers in order", async () => {
      const order: number[] = [];

      hookManager.register("session_start", async () => {
        order.push(1);
      });
      hookManager.register("session_start", async () => {
        order.push(2);
      });
      hookManager.register("session_start", async () => {
        order.push(3);
      });

      await hookManager.run("session_start");

      expect(order).toEqual([1, 2, 3]);
    });

    it("should return empty array when no handlers are registered", async () => {
      const messages = await hookManager.run("stop");
      expect(messages).toEqual([]);
    });

    it("should collect messages from handlers that return them", async () => {
      hookManager.register("post_edit", async (): Promise<HookResult> => {
        return { message: "Formatted file" };
      });
      hookManager.register("post_edit", async (): Promise<void> => {
        // Returns nothing
      });
      hookManager.register("post_edit", async (): Promise<HookResult> => {
        return { message: "Lint passed" };
      });

      const messages = await hookManager.run("post_edit", { filePath: "/test.ts" });

      expect(messages).toEqual(["Formatted file", "Lint passed"]);
    });

    it("should not fire handlers registered for different events", async () => {
      const handler = vi.fn<HookHandler>().mockResolvedValue(undefined);

      hookManager.register("pre_tool_use", handler);
      await hookManager.run("post_tool_use", { toolName: "write" });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should catch and continue when a handler throws", async () => {
      const handlerBefore = vi.fn<HookHandler>().mockResolvedValue({ message: "before" });
      const throwingHandler = vi.fn<HookHandler>().mockRejectedValue(new Error("Hook failed!"));
      const handlerAfter = vi.fn<HookHandler>().mockResolvedValue({ message: "after" });

      hookManager.register("post_tool_use", handlerBefore);
      hookManager.register("post_tool_use", throwingHandler);
      hookManager.register("post_tool_use", handlerAfter);

      // Should not throw
      const messages = await hookManager.run("post_tool_use", { toolName: "bash" });

      expect(handlerBefore).toHaveBeenCalledOnce();
      expect(throwingHandler).toHaveBeenCalledOnce();
      expect(handlerAfter).toHaveBeenCalledOnce();
      expect(messages).toEqual(["before", "after"]);
    });

    it("should never crash the system even on unexpected errors", async () => {
      hookManager.register("stop", async () => {
        throw "string error"; // non-Error throw
      });

      const messages = await hookManager.run("stop");
      expect(messages).toEqual([]);
    });
  });

  describe("loadFromSettings", () => {
    it("should register shell command hooks from settings", async () => {
      const settings = makeSettings({
        post_edit: [{ command: "npx prettier --write" }],
      });

      hookManager.loadFromSettings(settings);

      // Simulate execFile callback for success
      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        if (typeof callback === "function") {
          (callback as (err: Error | null, stdout: string, stderr: string) => void)(
            null,
            "Formatted!\n",
            ""
          );
        }
        return undefined as never;
      });

      const messages = await hookManager.run("post_edit", {
        filePath: "/src/test.ts",
        toolName: "edit",
      });

      expect(mockedExecFile).toHaveBeenCalledOnce();
      expect(messages).toEqual(["Formatted!"]);
    });

    it("should handle empty hooks config", () => {
      const settings = makeSettings({});

      // Should not throw
      hookManager.loadFromSettings(settings);
    });

    it("should register hooks for multiple events", async () => {
      const settings = makeSettings({
        session_start: [{ command: "echo session started" }],
        stop: [{ command: "echo done" }],
      });

      hookManager.loadFromSettings(settings);

      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        if (typeof callback === "function") {
          (callback as (err: Error | null, stdout: string, stderr: string) => void)(
            null,
            "ok\n",
            ""
          );
        }
        return undefined as never;
      });

      const startMessages = await hookManager.run("session_start");
      const stopMessages = await hookManager.run("stop");

      expect(startMessages).toEqual(["ok"]);
      expect(stopMessages).toEqual(["ok"]);
      expect(mockedExecFile).toHaveBeenCalledTimes(2);
    });
  });

  describe("matcher filtering", () => {
    it("should only fire when tool name matches the matcher regex", async () => {
      const settings = makeSettings({
        post_tool_use: [{ command: "echo matched", matcher: "^(edit|write)$" }],
      });

      hookManager.loadFromSettings(settings);

      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        if (typeof callback === "function") {
          (callback as (err: Error | null, stdout: string, stderr: string) => void)(
            null,
            "matched\n",
            ""
          );
        }
        return undefined as never;
      });

      // Should not match "read"
      const readMessages = await hookManager.run("post_tool_use", { toolName: "read" });
      expect(readMessages).toEqual([]);
      expect(mockedExecFile).not.toHaveBeenCalled();

      // Should match "edit"
      const editMessages = await hookManager.run("post_tool_use", { toolName: "edit" });
      expect(editMessages).toEqual(["matched"]);
      expect(mockedExecFile).toHaveBeenCalledOnce();
    });

    it("should match file path when tool name is not available", async () => {
      const settings = makeSettings({
        post_edit: [{ command: "npx prettier --write", matcher: "\\.(ts|tsx)$" }],
      });

      hookManager.loadFromSettings(settings);

      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        if (typeof callback === "function") {
          (callback as (err: Error | null, stdout: string, stderr: string) => void)(
            null,
            "formatted\n",
            ""
          );
        }
        return undefined as never;
      });

      // Should not match .py files
      const pyMessages = await hookManager.run("post_edit", { filePath: "/src/test.py" });
      expect(pyMessages).toEqual([]);

      // Should match .ts files
      const tsMessages = await hookManager.run("post_edit", { filePath: "/src/test.ts" });
      expect(tsMessages).toEqual(["formatted"]);
    });

    it("should fire for all tools when no matcher is specified", async () => {
      const settings = makeSettings({
        pre_tool_use: [{ command: "echo hook" }],
      });

      hookManager.loadFromSettings(settings);

      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        if (typeof callback === "function") {
          (callback as (err: Error | null, stdout: string, stderr: string) => void)(
            null,
            "hook\n",
            ""
          );
        }
        return undefined as never;
      });

      const messages = await hookManager.run("pre_tool_use", { toolName: "anything" });
      expect(messages).toEqual(["hook"]);
    });
  });

  describe("shell command execution", () => {
    it("should handle shell command failure gracefully", async () => {
      const settings = makeSettings({
        post_edit: [{ command: "failing-command" }],
      });

      hookManager.loadFromSettings(settings);

      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        if (typeof callback === "function") {
          (callback as (err: Error | null, stdout: string, stderr: string) => void)(
            new Error("Command not found"),
            "",
            "command not found"
          );
        }
        return undefined as never;
      });

      // Should not throw, should return error message
      const messages = await hookManager.run("post_edit", { filePath: "/test.ts" });
      expect(messages.length).toBe(1);
      expect(messages[0]).toContain("Hook error");
      expect(messages[0]).toContain("Command not found");
    });

    it("should pass HOOK_CONTEXT env variable", async () => {
      const settings = makeSettings({
        post_tool_use: [{ command: "my-hook-script" }],
      });

      hookManager.loadFromSettings(settings);

      mockedExecFile.mockImplementation((_cmd, _args, opts, callback) => {
        if (typeof callback === "function") {
          (callback as (err: Error | null, stdout: string, stderr: string) => void)(
            null,
            "",
            ""
          );
        }
        return undefined as never;
      });

      await hookManager.run("post_tool_use", {
        toolName: "bash",
        filePath: "/test.sh",
      });

      expect(mockedExecFile).toHaveBeenCalledOnce();
      const callArgs = mockedExecFile.mock.calls[0];
      const opts = callArgs?.[2] as { env?: Record<string, string> };
      const hookContext = JSON.parse(opts?.env?.HOOK_CONTEXT ?? "{}");

      expect(hookContext).toEqual(
        expect.objectContaining({
          event: "post_tool_use",
          toolName: "bash",
          filePath: "/test.sh",
        })
      );
    });

    it("should return no message when stdout is empty", async () => {
      const settings = makeSettings({
        session_start: [{ command: "silent-script" }],
      });

      hookManager.loadFromSettings(settings);

      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        if (typeof callback === "function") {
          (callback as (err: Error | null, stdout: string, stderr: string) => void)(
            null,
            "",
            ""
          );
        }
        return undefined as never;
      });

      const messages = await hookManager.run("session_start");
      expect(messages).toEqual([]);
    });
  });
});

describe("createAutoLintHook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should run lint command with the file path", async () => {
    const hook = createAutoLintHook("npx prettier --write");

    mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      if (typeof callback === "function") {
        (callback as (err: Error | null, stdout: string, stderr: string) => void)(
          null,
          "test.ts 42ms\n",
          ""
        );
      }
      return undefined as never;
    });

    const context: HookContext = {
      event: "post_edit",
      filePath: "/src/test.ts",
      toolName: "edit",
    };

    const result = await hook(context);

    expect(mockedExecFile).toHaveBeenCalledOnce();
    const callArgs = mockedExecFile.mock.calls[0];
    expect(callArgs?.[0]).toBe("npx");
    expect(callArgs?.[1]).toEqual(["prettier", "--write", "/src/test.ts"]);
    expect(result).toEqual({ message: "Lint: test.ts 42ms" });
  });

  it("should skip when no filePath is provided", async () => {
    const hook = createAutoLintHook("npx prettier --write");

    const context: HookContext = {
      event: "post_edit",
      toolName: "edit",
    };

    const result = await hook(context);

    expect(mockedExecFile).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("should handle lint failure without throwing", async () => {
    const hook = createAutoLintHook("npx eslint --fix");

    mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      if (typeof callback === "function") {
        (callback as (err: Error | null, stdout: string, stderr: string) => void)(
          new Error("Lint errors found"),
          "",
          "error: unexpected token"
        );
      }
      return undefined as never;
    });

    const context: HookContext = {
      event: "post_edit",
      filePath: "/src/broken.ts",
      toolName: "write",
    };

    // Should not throw
    const result = await hook(context);

    expect(result).toBeDefined();
    expect(result?.message).toContain("Lint failed");
    expect(result?.message).toContain("unexpected token");
  });

  it("should return undefined when lint succeeds with no output", async () => {
    const hook = createAutoLintHook("npx prettier --write");

    mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      if (typeof callback === "function") {
        (callback as (err: Error | null, stdout: string, stderr: string) => void)(
          null,
          "",
          ""
        );
      }
      return undefined as never;
    });

    const context: HookContext = {
      event: "post_edit",
      filePath: "/src/clean.ts",
    };

    const result = await hook(context);
    expect(result).toBeUndefined();
  });
});
