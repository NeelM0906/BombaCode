import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Header } from "./components/Header.js";
import { InputBar } from "./components/InputBar.js";
import { MessageList } from "./components/MessageList.js";
import { PermissionPrompt } from "./components/PermissionPrompt.js";
import type { PermissionPromptDecision } from "./components/PermissionPrompt.js";
import { SlashCommandRegistry } from "./command-registry.js";
import { AgentLoop } from "../core/agent-loop.js";
import { MessageManager } from "../core/message-manager.js";
import { ContextManager } from "../core/context-manager.js";
import { SessionManager } from "../core/session-manager.js";
import { CostTracker } from "../llm/cost-tracker.js";
import { createProvider } from "../llm/provider-factory.js";
import { buildSystemPrompt } from "../core/system-prompt.js";
import { ToolRegistry } from "../core/tool-registry.js";
import { ToolRouter } from "../core/tool-router.js";
import { CheckpointManager } from "../core/checkpoint-manager.js";
import {
  PermissionManager,
  type PermissionDecision,
  type PermissionMode,
} from "../core/permission-manager.js";
import { registerBuiltinTools } from "../tools/index.js";
import type { Settings } from "../memory/settings.js";
import type { Message, TokenUsage, ToolCall, ToolResult } from "../llm/types.js";
import { buildToolResultMap } from "./utils/tool-result-map.js";
import { logger } from "../utils/logger.js";
import { MCPServerManager } from "../mcp/server-manager.js";
import { adaptAllMCPTools } from "../mcp/tool-adapter.js";
import { HookManager } from "../hooks/hook-manager.js";

export interface AppProps {
  settings: Settings;
  initialPrompt?: string;
  resumeId?: string;
}

export const CONTINUE_LAST_SESSION = "__continue_last__";

export function shouldAutoSubmitInitialPrompt(
  initialPrompt: string | undefined,
  submittedPrompt: string | undefined
): boolean {
  if (!initialPrompt || initialPrompt.trim().length === 0) {
    return false;
  }

  return initialPrompt !== submittedPrompt;
}

function parseMode(input: string): PermissionMode | null {
  if (input === "normal" || input === "auto-edit" || input === "yolo" || input === "plan") {
    return input;
  }

  return null;
}

/** Threshold for collapsing tool output (non-empty line count). */
const COLLAPSED_LINE_LIMIT = 5;

function isCollapsibleToolResult(toolCall: ToolCall, result: ToolResult): boolean {
  if (toolCall.name === "read" || result.isError) {
    return false;
  }

  // For edit tools the content includes both a summary header and the diff.
  // Only the diff portion (starting at the first @@ marker) determines
  // whether the output is long enough to collapse.
  let content = result.content;
  if (toolCall.name === "edit") {
    const diffStart = content.indexOf("@@");
    if (diffStart === -1) {
      return false; // no diff present — nothing to collapse
    }
    content = content.slice(diffStart);
  }

  const nonEmptyLines = content.split("\n").filter((line) => line.trim().length > 0).length;
  return nonEmptyLines > COLLAPSED_LINE_LIMIT;
}

function findLastCollapsibleToolId(
  messages: Message[],
  resultMap: Map<string, ToolResult>
): string | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message.role !== "assistant" || !message.toolCalls) {
      continue;
    }

    for (let toolIndex = message.toolCalls.length - 1; toolIndex >= 0; toolIndex -= 1) {
      const toolCall = message.toolCalls[toolIndex];
      if (!toolCall) {
        continue;
      }

      const result = resultMap.get(toolCall.id);
      if (!result) {
        continue;
      }

      if (isCollapsibleToolResult(toolCall, result)) {
        return toolCall.id;
      }
    }
  }

  return null;
}

export const App: React.FC<AppProps> = ({ settings, initialPrompt, resumeId }) => {
  const { exit } = useApp();

  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [totalTokens, setTotalTokens] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(
    settings.permissions.mode ?? "normal"
  );

  const [activeToolCalls, setActiveToolCalls] = useState<Map<string, ToolCall>>(new Map());
  const [toolResults, setToolResults] = useState<Map<string, ToolResult>>(new Map());
  const [permissionRequest, setPermissionRequest] = useState<ToolCall | null>(null);
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);

  const messageManagerRef = useRef<MessageManager>(new MessageManager());
  const contextManagerRef = useRef<ContextManager | null>(null);
  const sessionManagerRef = useRef<SessionManager>(new SessionManager());
  const costTrackerRef = useRef<CostTracker>(new CostTracker());
  const checkpointManagerRef = useRef<CheckpointManager>(new CheckpointManager());
  const permissionManagerRef = useRef<PermissionManager | null>(null);
  const toolRegistryRef = useRef<ToolRegistry | null>(null);
  const toolRouterRef = useRef<ToolRouter | null>(null);
  const commandRegistryRef = useRef<SlashCommandRegistry | null>(null);
  const agentLoopRef = useRef<AgentLoop | null>(null);
  const permissionResolverRef = useRef<((decision: PermissionDecision) => void) | null>(null);
  const submittedInitialPromptRef = useRef<string | undefined>(undefined);
  const mcpManagerRef = useRef<MCPServerManager | null>(null);
  const hookManagerRef = useRef<HookManager | null>(null);

  const activeToolName = useMemo(() => {
    const firstActive = activeToolCalls.values().next().value as ToolCall | undefined;
    return firstActive?.name;
  }, [activeToolCalls]);

  const combinedResultMap = useMemo(
    () => buildToolResultMap(messages, toolResults),
    [messages, toolResults]
  );

  const handlePermissionDecision = useCallback(
    (decision: PermissionPromptDecision) => {
      const resolver = permissionResolverRef.current;
      const requestedTool = permissionRequest;

      permissionResolverRef.current = null;
      setPermissionRequest(null);

      if (!resolver) {
        return;
      }

      if (decision === "always_allow" && requestedTool && permissionManagerRef.current) {
        permissionManagerRef.current.addSessionAllow(requestedTool.name);
        resolver("allowed");
        return;
      }

      resolver(decision === "allowed" ? "allowed" : "denied");
    },
    [permissionRequest]
  );

  const requestPermission = useCallback((toolCall: ToolCall): Promise<PermissionDecision> => {
    return new Promise<PermissionDecision>((resolve) => {
      permissionResolverRef.current = resolve;
      setPermissionRequest(toolCall);
    });
  }, []);

  useEffect(() => {
    try {
      const provider = createProvider(settings);
      const systemPrompt = buildSystemPrompt(process.cwd());

      const registry = new ToolRegistry();
      registerBuiltinTools(registry, process.cwd());
      toolRegistryRef.current = registry;

      // Start MCP servers in background — tools become available asynchronously
      const mcpServers = settings.mcpServers ?? {};
      if (Object.keys(mcpServers).length > 0) {
        const mcpManager = new MCPServerManager(mcpServers);
        mcpManagerRef.current = mcpManager;

        void mcpManager.startAll().then(async () => {
          try {
            const mcpTools = await mcpManager.getTools();
            const adaptedTools = await adaptAllMCPTools(
              mcpTools,
              (name) => mcpManager.getClient(name)
            );

            for (const tool of adaptedTools) {
              if (!registry.hasTool(tool.name)) {
                registry.register(tool);
              }
            }

            // Update system prompt with MCP tool info
            const mcpToolInfo = mcpTools.map((t) => ({
              name: `mcp_${t.name}`,
              description: t.description,
            }));
            if (mcpToolInfo.length > 0 && agentLoopRef.current) {
              const updatedPrompt = buildSystemPrompt(process.cwd(), {
                mcpTools: mcpToolInfo,
              });
              agentLoopRef.current.setSystemPrompt(updatedPrompt);
            }

            logger.info("MCP tools registered", {
              count: adaptedTools.length,
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error("Failed to register MCP tools", msg);
          }
        });
      }

      const contextManager = new ContextManager({
        provider,
        messageManager: messageManagerRef.current,
        model: settings.models.fast,
        maxContextTokens: provider.getMaxContextTokens(settings.defaultModel),
        reservedOutputTokens: 35_000,
        systemPromptTokens: provider.estimateTokens(systemPrompt),
        toolDefinitionTokens: provider.estimateTokens(JSON.stringify(registry.getToolDefinitions())),
        compactThreshold: settings.autoCompactAt,
      });
      contextManagerRef.current = contextManager;

      if (resumeId) {
        const resumedMessages =
          resumeId === CONTINUE_LAST_SESSION
            ? sessionManagerRef.current.continueLast()
            : sessionManagerRef.current.resume(resumeId);

        if (resumedMessages && resumedMessages.length > 0) {
          messageManagerRef.current.setMessages(resumedMessages);
          setMessages([...resumedMessages]);
          setNotice(
            `Resumed session ${sessionManagerRef.current.getCurrentId()} with ${resumedMessages.length} messages.`
          );
        } else {
          setNotice(
            resumeId === CONTINUE_LAST_SESSION
              ? "No previous session found to continue."
              : `Session not found: ${resumeId}`
          );
        }
      }

      const commandRegistry = new SlashCommandRegistry();
      commandRegistry.register({
        name: "help",
        description: "Show available commands",
        argHint: "",
        aliases: [],
        handler: () => {
          const lines = commandRegistry
            .getAll()
            .map((command) => {
              const usage = command.argHint ? `/${command.name} ${command.argHint}` : `/${command.name}`;
              return `${usage} - ${command.description}`;
            });
          lines.push("Shortcuts: Shift+Enter or Ctrl+J for newline.");
          setNotice(lines.join("\n"));
          setError(undefined);
        },
      });
      commandRegistry.register({
        name: "clear",
        description: "Clear conversation",
        argHint: "",
        aliases: [],
        handler: () => {
          messageManagerRef.current.clear();
          costTrackerRef.current.reset();
          setMessages([]);
          setTotalTokens(0);
          setTotalCost(0);
          setError(undefined);
          setNotice("Cleared conversation state.");
          setToolResults(new Map());
          setActiveToolCalls(new Map());
          setExpandedToolId(null);
        },
      });
      commandRegistry.register({
        name: "cost",
        description: "Show session cost",
        argHint: "",
        aliases: [],
        handler: () => {
          const tracker = costTrackerRef.current;
          setNotice(
            `Session: ${tracker.getTotalTokens().toLocaleString()} tokens | $${tracker
              .getSessionCost()
              .toFixed(4)} | ${tracker.getTurnCount()} turns`
          );
          setError(undefined);
        },
      });
      commandRegistry.register({
        name: "undo",
        description: "Restore last checkpoint",
        argHint: "",
        aliases: [],
        handler: async () => {
          const undoResult = await checkpointManagerRef.current.undo();
          if (!undoResult) {
            setNotice("No checkpoint available to undo.");
          } else {
            setNotice(`Restored: ${undoResult.filePath}`);
          }
          setError(undefined);
        },
      });
      commandRegistry.register({
        name: "tools",
        description: "List available tools",
        argHint: "",
        aliases: [],
        handler: () => {
          const toolNames = toolRegistryRef.current?.getToolNames() ?? [];
          setNotice(`Tools: ${toolNames.join(", ")}`);
          setError(undefined);
        },
      });
      commandRegistry.register({
        name: "mode",
        description: "Set permission mode",
        argHint: "<normal|auto-edit|yolo|plan>",
        aliases: [],
        handler: (input) => {
          const requestedMode = input.trim().split(/\s+/)[1];
          const parsed = parseMode(requestedMode ?? "");

          if (!parsed) {
            setError("Invalid mode. Use: /mode normal|auto-edit|yolo|plan");
            return;
          }

          permissionManagerRef.current?.setMode(parsed);
          setPermissionMode(parsed);
          setNotice(`Permission mode set to ${parsed}.`);
          setError(undefined);
        },
      });
      commandRegistry.register({
        name: "exit",
        description: "Exit BombaCode",
        argHint: "",
        aliases: ["quit"],
        handler: () => {
          exit();
        },
      });
      commandRegistryRef.current = commandRegistry;

      // Initialize hook manager and load hooks from settings
      const hookManager = new HookManager();
      hookManager.loadFromSettings(settings);
      hookManagerRef.current = hookManager;

      const manager = new PermissionManager(
        settings.permissions.mode ?? "normal",
        settings.permissions.customRules ?? []
      );
      permissionManagerRef.current = manager;
      setPermissionMode(manager.getMode());

      const toolRouter = new ToolRouter({
        registry,
        permissionManager: manager,
        checkpointManager: checkpointManagerRef.current,
        hookManager,
        onToolStart: (toolCall) => {
          setActiveToolCalls((prev) => new Map(prev).set(toolCall.id, toolCall));
        },
        onToolEnd: (toolCall, result) => {
          setActiveToolCalls((prev) => {
            const next = new Map(prev);
            next.delete(toolCall.id);
            return next;
          });

          setToolResults((prev) => new Map(prev).set(result.toolUseId, result));
        },
        onPermissionRequest: requestPermission,
      });

      toolRouterRef.current = toolRouter;

      agentLoopRef.current = new AgentLoop({
        messageManager: messageManagerRef.current,
        provider,
        costTracker: costTrackerRef.current,
        model: settings.defaultModel,
        systemPrompt,
        maxTokens: 32_768,
        maxTurns: 25,
        toolRegistry: registry,
        toolRouter,
        contextManager,
        hookManager,
        onStreamDelta: (text) => {
          setStreamingText((prev) => (prev ?? "") + text);
        },
        onStreamEnd: () => {
          setStreamingText(undefined);
          sessionManagerRef.current.save(messageManagerRef.current.getMessages());
          setMessages([...messageManagerRef.current.getMessages()]);
          setTotalTokens(costTrackerRef.current.getTotalTokens());
          setTotalCost(costTrackerRef.current.getSessionCost());
        },
        onUsageUpdate: (_usage: TokenUsage) => {
          setTotalTokens(costTrackerRef.current.getTotalTokens());
          setTotalCost(costTrackerRef.current.getSessionCost());
        },
        onToolCallStart: (toolCall) => {
          setActiveToolCalls((prev) => {
            if (prev.has(toolCall.id)) {
              return prev;
            }

            return new Map(prev).set(toolCall.id, toolCall);
          });
        },
        onToolCallEnd: (toolCall, result) => {
          setActiveToolCalls((prev) => {
            const next = new Map(prev);
            next.delete(toolCall.id);
            return next;
          });

          setToolResults((prev) => new Map(prev).set(result.toolUseId, result));
        },
        onError: (err) => {
          setError(err.message);
          setIsLoading(false);
          setStreamingText(undefined);
        },
      });

      logger.info("Agent loop initialized", {
        model: settings.defaultModel,
        toolCount: registry.getToolNames().length,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to initialize: ${message}`);
      logger.error("Failed to initialize app", message);
    }
  }, [exit, requestPermission, settings]);

  const handleSubmit = useCallback(
    async (input: string) => {
      if (!agentLoopRef.current || isLoading) {
        return;
      }

      if (input.startsWith("/") && commandRegistryRef.current) {
        const handled = await commandRegistryRef.current.execute(input);
        if (handled) {
          return;
        }

        const unknown = input.trim().split(/\s+/, 1)[0] ?? input.trim();
        setError(`Unknown command: ${unknown}. Type /help for available commands.`);
        return;
      }

      setError(undefined);
      setNotice(undefined);
      setIsLoading(true);
      setStreamingText("");
      setExpandedToolId(null);

      setMessages((prev) => [...prev, { role: "user", content: input }]);

      try {
        await agentLoopRef.current.processUserInput(input);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        setIsLoading(false);
        setStreamingText(undefined);
        setMessages([...messageManagerRef.current.getMessages()]);
      }
    },
    [isLoading]
  );

  const handleSlashCommand = useCallback(async (input: string) => {
    if (!commandRegistryRef.current) return;
    const handled = await commandRegistryRef.current.execute(input);
    if (!handled) {
      const unknown = input.trim().split(/\s+/, 1)[0] ?? input.trim();
      setError(`Unknown command: ${unknown}. Type /help for available commands.`);
    }
  }, []);

  useEffect(() => {
    if (!agentLoopRef.current) {
      return;
    }

    const promptToSubmit = initialPrompt;
    if (!promptToSubmit) {
      return;
    }

    if (!shouldAutoSubmitInitialPrompt(promptToSubmit, submittedInitialPromptRef.current)) {
      return;
    }

    submittedInitialPromptRef.current = promptToSubmit;
    void handleSubmit(promptToSubmit);
  }, [handleSubmit, initialPrompt]);

  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === "o") {
      if (expandedToolId) {
        setExpandedToolId(null);
      } else {
        const targetToolId = findLastCollapsibleToolId(messages, combinedResultMap);
        if (targetToolId) {
          setExpandedToolId(targetToolId);
        }
      }
      return;
    }

    if (key.escape && expandedToolId && !permissionRequest) {
      setExpandedToolId(null);
      return;
    }

    if (key.ctrl && inputChar === "c") {
      if (permissionRequest && permissionResolverRef.current) {
        handlePermissionDecision("denied");
        return;
      }

      if (isLoading && agentLoopRef.current) {
        agentLoopRef.current.abort();
        setIsLoading(false);
        setStreamingText(undefined);
      } else {
        exit();
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Header model={settings.defaultModel} tokens={totalTokens} cost={totalCost} activeToolName={activeToolName} />

      {messages.length === 0 && !isLoading ? (
        <Box flexDirection="column" marginTop={1} paddingX={1}>
          <Text color="green">BombaCode v0.1.0 — ready. Type a message to begin.</Text>
          <Text dimColor>Working directory: {process.cwd()}</Text>
          {resumeId ? (
            <Text dimColor>
              Resuming session: {resumeId === CONTINUE_LAST_SESSION ? "last session" : resumeId}
            </Text>
          ) : null}
          <Text dimColor>Type /help for available commands. Shift+Enter or Ctrl+J for newline.</Text>
          <Text dimColor>Permission mode: {permissionMode}</Text>
        </Box>
      ) : null}

      <MessageList
        messages={messages}
        streamingText={streamingText}
        activeToolCalls={activeToolCalls}
        toolResults={combinedResultMap}
        expandedToolId={expandedToolId}
      />

      {permissionRequest ? (
        <PermissionPrompt toolCall={permissionRequest} onDecision={handlePermissionDecision} />
      ) : null}

      {notice ? (
        <Box paddingX={1} marginTop={1}>
          <Text color="cyan">{notice}</Text>
        </Box>
      ) : null}

      {error ? (
        <Box paddingX={1} marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      ) : null}

      <Box paddingX={1} marginTop={1}>
        <Text dimColor>{"-".repeat(Math.max(10, (process.stdout.columns ?? 80) - 2))}</Text>
      </Box>

      <Box marginTop={1}>
        <InputBar
          onSubmit={handleSubmit}
          onSlashCommand={handleSlashCommand}
          commandRegistry={commandRegistryRef.current ?? undefined}
          loading={isLoading}
          isFocused={!permissionRequest}
          expandedToolId={expandedToolId}
        />
      </Box>
    </Box>
  );
};
