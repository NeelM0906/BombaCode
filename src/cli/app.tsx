import React, { useState, useCallback, useEffect, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Header } from "./components/Header.js";
import { InputBar } from "./components/InputBar.js";
import { MessageList } from "./components/MessageList.js";
import { ToolOutput } from "./components/ToolOutput.js";
import { AgentLoop } from "../core/agent-loop.js";
import { MessageManager } from "../core/message-manager.js";
import { CostTracker } from "../llm/cost-tracker.js";
import { createProvider } from "../llm/provider-factory.js";
import { buildSystemPrompt } from "../core/system-prompt.js";
import type { Settings } from "../memory/settings.js";
import type { Message, TokenUsage } from "../llm/types.js";
import { logger } from "../utils/logger.js";

export interface AppProps {
  settings: Settings;
  initialPrompt?: string;
  resumeId?: string;
}

export const App: React.FC<AppProps> = ({ settings, initialPrompt, resumeId }) => {
  const { exit } = useApp();

  // Core state
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [totalTokens, setTotalTokens] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);
  const [collapseToolOutputs, setCollapseToolOutputs] = useState(false);

  // Refs for agent loop components (persist across renders)
  const messageManagerRef = useRef<MessageManager>(new MessageManager());
  const costTrackerRef = useRef<CostTracker>(new CostTracker());
  const agentLoopRef = useRef<AgentLoop | null>(null);

  // Initialize agent loop once
  useEffect(() => {
    try {
      const provider = createProvider(settings);
      const systemPrompt = buildSystemPrompt(process.cwd());

      agentLoopRef.current = new AgentLoop({
        messageManager: messageManagerRef.current,
        provider,
        costTracker: costTrackerRef.current,
        model: settings.defaultModel,
        systemPrompt,
        maxTokens: 4096,
        onStreamDelta: (text) => {
          setStreamingText((prev) => (prev ?? "") + text);
        },
        onStreamEnd: (fullResponse) => {
          setStreamingText(undefined);
          // Sync messages from message manager
          setMessages([...messageManagerRef.current.getMessages()]);
          setTotalTokens(costTrackerRef.current.getTotalTokens());
          setTotalCost(costTrackerRef.current.getSessionCost());
        },
        onUsageUpdate: (usage: TokenUsage) => {
          setTotalTokens(costTrackerRef.current.getTotalTokens());
          setTotalCost(costTrackerRef.current.getSessionCost());
        },
        onError: (err) => {
          setError(err.message);
          setIsLoading(false);
          setStreamingText(undefined);
        },
      });

      logger.info("Agent loop initialized", { model: settings.defaultModel });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to initialize: ${msg}`);
      logger.error("Failed to initialize agent loop", msg);
    }
  }, [settings]);

  // Process initial prompt if provided
  useEffect(() => {
    if (initialPrompt && agentLoopRef.current && !isLoading) {
      handleSubmit(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  const handleSubmit = useCallback(async (input: string) => {
    if (!agentLoopRef.current || isLoading) return;

    // Handle special commands
    if (input === "/exit" || input === "/quit") {
      exit();
      return;
    }

    if (input === "/clear") {
      messageManagerRef.current.clear();
      costTrackerRef.current.reset();
      setMessages([]);
      setTotalTokens(0);
      setTotalCost(0);
      setError(undefined);
      return;
    }

    if (input === "/cost") {
      const tracker = costTrackerRef.current;
      setError(
        `Session: ${tracker.getTotalTokens().toLocaleString()} tokens | $${tracker.getSessionCost().toFixed(4)} | ${tracker.getTurnCount()} turns`
      );
      return;
    }

    setError(undefined);
    setIsLoading(true);
    setStreamingText("");

    // Show user message immediately in the UI (processUserInput adds it to the manager)
    setMessages((prev) => [...prev, { role: "user", content: input }]);

    try {
      await agentLoopRef.current.processUserInput(input);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
      setStreamingText(undefined);
      // Re-sync with the canonical message manager state
      setMessages([...messageManagerRef.current.getMessages()]);
    }
  }, [isLoading, exit]);

  // Ctrl+C to abort current operation or exit
  useInput((inputChar, key) => {
    if (inputChar === "t" && !key.ctrl && !key.meta && !isLoading) {
      setCollapseToolOutputs((value) => !value);
      return;
    }

    if (key.ctrl && inputChar === "c") {
      if (isLoading && agentLoopRef.current) {
        agentLoopRef.current.abort();
        setIsLoading(false);
        setStreamingText(undefined);
      } else {
        exit();
      }
    }
  });

  const toolOutputs = messages
    .filter((message) => message.role === "tool")
    .map((message, index) => ({
      id: `${index}-${message.toolUseId}`,
      tool: `tool:${message.toolUseId}`,
      content: message.content,
    }));

  return (
    <Box flexDirection="column">
      <Header
        model={settings.defaultModel}
        tokens={totalTokens}
        cost={totalCost}
      />

      {/* Welcome message when empty */}
      {messages.length === 0 && !isLoading && (
        <Box flexDirection="column" marginTop={1} paddingX={1}>
          <Text color="green">
            BombaCode v0.1.0 — ready. Type a message to begin.
          </Text>
          <Text dimColor>
            Working directory: {process.cwd()}
          </Text>
          {resumeId ? <Text dimColor>Resuming session: {resumeId}</Text> : null}
          <Text dimColor>
            Commands: /clear, /cost, /exit | toggle tool output: t
          </Text>
        </Box>
      )}

      {/* Messages */}
      <MessageList messages={messages} streamingText={streamingText} />

      {toolOutputs.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Box paddingX={1}>
            <Text color="magenta" bold>
              Tool output ({toolOutputs.length}) - {collapseToolOutputs ? "collapsed" : "expanded"}
            </Text>
          </Box>
          {toolOutputs.map((item) => (
            <ToolOutput key={item.id} item={item} collapsed={collapseToolOutputs} />
          ))}
        </Box>
      )}

      {/* Error display */}
      {error && (
        <Box paddingX={1} marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      <Box paddingX={1} marginTop={1}>
        <Text dimColor>{"-".repeat(Math.max(10, (process.stdout.columns ?? 80) - 2))}</Text>
      </Box>

      {/* Input */}
      <Box marginTop={1}>
        <InputBar onSubmit={handleSubmit} loading={isLoading} />
      </Box>
    </Box>
  );
};
