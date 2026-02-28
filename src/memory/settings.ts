import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getConfigDir } from "../utils/platform.js";

const ModelConfigSchema = z.object({
  fast: z.string(),
  balanced: z.string(),
  powerful: z.string(),
});

const PermissionModeSchema = z.enum(["normal", "auto-edit", "yolo", "plan"]);

const PermissionRuleSchema = z.object({
  type: z.enum(["allow", "deny", "ask"]),
  tool: z.string().optional(),
  pathPattern: z.string().optional(),
  commandPattern: z.string().optional(),
});

const MCPServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const SettingsSchema = z.object({
  provider: z.enum(["openrouter", "openai-compat", "anthropic"]).default("openrouter"),
  apiKey: z.string().optional(),
  openAICompatBaseUrl: z.string().default("http://localhost:4000/v1"),
  defaultModel: z.string().default("anthropic/claude-sonnet-4-6"),
  models: ModelConfigSchema.default({
    fast: "anthropic/claude-haiku-4-5",
    balanced: "anthropic/claude-sonnet-4-6",
    powerful: "anthropic/claude-opus-4-6",
  }),
  costMode: z.enum(["quality-first", "balanced", "cost-first"]).default("balanced"),
  maxTokenBudget: z.number().nullable().default(null),
  autoCompactAt: z.number().min(0).max(1).default(0.85),
  permissions: z
    .object({
      mode: PermissionModeSchema.default("normal"),
      customRules: z.array(PermissionRuleSchema).default([]),
      allowFileWrite: z.enum(["allow", "deny", "ask"]).optional(),
      allowBash: z.enum(["allow", "deny", "ask"]).optional(),
      allowNetwork: z.enum(["allow", "deny", "ask"]).optional(),
    })
    .default({
      mode: "normal",
      customRules: [],
    }),
  mcpServers: z.record(z.string(), MCPServerSchema).default({}),
});

export type Settings = z.infer<typeof SettingsSchema>;

const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
const SETTINGS_PATH = join(getConfigDir(), "settings.json");

function ensureConfigDirectory(): void {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
}

function deepMerge(current: Settings, partial: Partial<Settings>): Settings {
  return {
    ...current,
    ...partial,
    models: {
      ...current.models,
      ...partial.models,
    },
    permissions: {
      ...current.permissions,
      ...partial.permissions,
    },
    mcpServers: {
      ...current.mcpServers,
      ...partial.mcpServers,
    },
  };
}

export function loadSettings(): Settings {
  ensureConfigDirectory();

  if (!existsSync(SETTINGS_PATH)) {
    return DEFAULT_SETTINGS;
  }

  try {
    const raw = JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) as unknown;
    return SettingsSchema.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(partial: Partial<Settings>): Settings {
  ensureConfigDirectory();
  const current = loadSettings();
  const merged = deepMerge(current, partial);
  const validated = SettingsSchema.parse(merged);
  writeFileSync(SETTINGS_PATH, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  return validated;
}

export function hasApiKey(provider?: Settings["provider"]): boolean {
  if (process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY) {
    return true;
  }

  const settings = loadSettings();

  if (provider === "openai-compat") {
    return true;
  }

  if (settings.provider === "openai-compat") {
    return true;
  }

  return Boolean(settings.apiKey && settings.apiKey.trim().length > 0);
}

export function getConfigPath(): string {
  ensureConfigDirectory();
  return SETTINGS_PATH;
}

export function clearSettings(): void {
  if (existsSync(SETTINGS_PATH)) {
    rmSync(SETTINGS_PATH);
  }
}
