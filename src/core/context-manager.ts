import type { LLMProvider, Message } from "../llm/types.js";
import type { MessageManager } from "./message-manager.js";
import { logger } from "../utils/logger.js";

const RECENT_MESSAGE_COUNT = 10;
const MAX_SUMMARY_MESSAGES = 15;
const SUMMARY_MAX_TOKENS = 1200;

export interface ContextManagerConfig {
  provider: LLMProvider;
  messageManager: MessageManager;
  model: string;
  maxContextTokens: number;
  reservedOutputTokens: number;
  systemPromptTokens: number;
  toolDefinitionTokens: number;
  compactThreshold: number;
}

export class ContextManager {
  private readonly provider: LLMProvider;
  private readonly messageManager: MessageManager;
  private readonly model: string;
  private readonly maxContextTokens: number;
  private readonly reservedOutputTokens: number;
  private readonly systemPromptTokens: number;
  private readonly toolDefinitionTokens: number;
  private readonly compactThreshold: number;

  constructor(config: ContextManagerConfig) {
    this.provider = config.provider;
    this.messageManager = config.messageManager;
    this.model = config.model;
    this.maxContextTokens = config.maxContextTokens;
    this.reservedOutputTokens = config.reservedOutputTokens;
    this.systemPromptTokens = config.systemPromptTokens;
    this.toolDefinitionTokens = config.toolDefinitionTokens;
    this.compactThreshold = config.compactThreshold;
  }

  async ensureWithinBudget(): Promise<void> {
    const currentTokens = this.messageManager.getEstimatedTokens();
    if (currentTokens <= this.getCompactTrigger()) {
      return;
    }

    await this.compact();
  }

  async compact(): Promise<void> {
    const messages = this.messageManager.getMessages();
    if (messages.length === 0) {
      return;
    }

    const beforeMessages = messages.length;
    const beforeTokens = this.messageManager.getEstimatedTokens();

    const pinnedIndices = this.getPinnedIndices(messages.length);
    const recentStart = Math.max(0, messages.length - RECENT_MESSAGE_COUNT);

    const summaryCandidates = this.getSummaryCandidates(messages.length, recentStart, pinnedIndices);
    const summaryIndices = summaryCandidates.slice(-MAX_SUMMARY_MESSAGES);

    const summaryText =
      summaryIndices.length > 0
        ? await this.generateSummary(messages, summaryIndices, summaryCandidates.length - summaryIndices.length)
        : null;

    const compacted = this.buildCompactedMessages(messages, pinnedIndices, recentStart, summaryIndices, summaryText);

    this.messageManager.setMessages(compacted);

    const budget = this.getAvailableForMessages();
    const compactedTokens = this.messageManager.getEstimatedTokens();

    if (compactedTokens > budget) {
      const removed = this.messageManager.truncate(budget);
      if (removed.length > 0) {
        logger.info("Truncated messages after compaction", {
          removed: removed.length,
          budget,
        });
      }
    }

    const afterMessages = this.messageManager.getMessageCount();
    const afterTokens = this.messageManager.getEstimatedTokens();

    logger.info("Context compacted", {
      beforeMessages,
      afterMessages,
      beforeTokens,
      afterTokens,
    });
  }

  getAvailableForMessages(): number {
    return Math.max(
      0,
      this.maxContextTokens -
        this.reservedOutputTokens -
        this.systemPromptTokens -
        this.toolDefinitionTokens
    );
  }

  getCompactTrigger(): number {
    return Math.floor(this.getAvailableForMessages() * this.compactThreshold);
  }

  private getPinnedIndices(totalMessages: number): Set<number> {
    const pinned = new Set<number>();

    for (let index = 0; index < totalMessages; index += 1) {
      if (this.messageManager.isPinned(index)) {
        pinned.add(index);
      }
    }

    return pinned;
  }

  private getSummaryCandidates(
    totalMessages: number,
    recentStart: number,
    pinned: Set<number>
  ): number[] {
    const candidates: number[] = [];

    for (let index = 0; index < totalMessages; index += 1) {
      if (index >= recentStart) {
        continue;
      }
      if (pinned.has(index)) {
        continue;
      }
      candidates.push(index);
    }

    return candidates;
  }

  private async generateSummary(
    messages: Message[],
    summaryIndices: number[],
    droppedCount: number
  ): Promise<string> {
    const serialized = summaryIndices
      .map((index) => this.serializeMessage(index, messages[index]!))
      .join("\n");

    const preface =
      droppedCount > 0
        ? `Dropped ${droppedCount} older messages before this summary due context budget.\n\n`
        : "";

    try {
      const response = await this.provider.createMessage({
        model: this.model,
        systemPrompt:
          "Summarize prior conversation context for a coding assistant. Keep key decisions, constraints, file paths, open tasks, and unresolved questions. Be concise and factual.",
        messages: [
          {
            role: "user",
            content: `${preface}Summarize the following messages for future context:\n\n${serialized}`,
          },
        ],
        maxTokens: SUMMARY_MAX_TOKENS,
        temperature: 0,
      });

      const summary = response.content.trim();
      if (summary.length === 0) {
        return `${preface}Previous context was compacted.`.trim();
      }

      return `${preface}${summary}`.trim();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("Context summarization failed", { error: message });
      return `${preface}Previous context was compacted.`.trim();
    }
  }

  private buildCompactedMessages(
    messages: Message[],
    pinnedIndices: Set<number>,
    recentStart: number,
    summaryIndices: number[],
    summaryText: string | null
  ): Message[] {
    const compacted: Message[] = [];
    const recentIndices = new Set<number>();

    for (let index = recentStart; index < messages.length; index += 1) {
      recentIndices.add(index);
    }

    const summaryStart = summaryIndices.length > 0 ? summaryIndices[0]! : -1;
    const summaryEnd = summaryIndices.length > 0 ? summaryIndices[summaryIndices.length - 1]! : -1;

    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      if (!message) {
        continue;
      }

      if (pinnedIndices.has(index)) {
        compacted.push(message);
        continue;
      }

      if (summaryText && summaryStart !== -1 && index === summaryStart) {
        compacted.push({ role: "user", content: `[Context summary]: ${summaryText}` });
        index = summaryEnd;
        continue;
      }

      if (recentIndices.has(index)) {
        compacted.push(message);
      }
    }

    return compacted;
  }

  private serializeMessage(index: number, message: Message): string {
    if (message.role === "tool") {
      return `[${index}] tool(${message.toolUseId}): ${message.content}`;
    }

    if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
      const tools = message.toolCalls.map((tool) => tool.name).join(", ");
      return `[${index}] assistant (tools: ${tools}): ${message.content}`;
    }

    return `[${index}] ${message.role}: ${message.content}`;
  }
}
