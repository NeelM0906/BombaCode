import { spawnSync } from "node:child_process";
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { App } from "./cli/app.js";
import { SetupWizard } from "./cli/components/SetupWizard.js";
import { SessionManager } from "./core/session-manager.js";
import { getConfigPath, hasApiKey, loadSettings, saveSettings } from "./memory/settings.js";
import { logger } from "./utils/logger.js";
import type { Settings } from "./memory/settings.js";

const VERSION = "0.1.0";

function parseProvider(value: string): Settings["provider"] {
  if (value === "openrouter" || value === "openai-compat" || value === "anthropic") {
    return value;
  }
  throw new Error(`Unsupported provider: ${value}`);
}

function launchApp(settings: Settings, initialPrompt?: string, resumeId?: string): void {
  const { waitUntilExit } = render(
    React.createElement(App, {
      settings,
      initialPrompt,
      resumeId,
    })
  );

  void waitUntilExit();
}

function launchWizard(initialPrompt?: string, resumeId?: string): void {
  const { unmount, waitUntilExit } = render(
    React.createElement(SetupWizard, {
      onComplete: (settings: Settings) => {
        unmount();
        launchApp(settings, initialPrompt, resumeId);
      },
    })
  );

  void waitUntilExit();
}

function applyRuntimeOverrides(settings: Settings, options: { model?: string; provider?: string }): Settings {
  const next: Settings = {
    ...settings,
    ...(options.model ? { defaultModel: options.model } : {}),
    ...(options.provider ? { provider: parseProvider(options.provider) } : {}),
  };

  return next;
}

function openConfigInEditor(): void {
  const configPath = getConfigPath();
  const editor = process.env.EDITOR;

  if (!editor) {
    console.log(configPath);
    return;
  }

  const status = spawnSync(editor, [configPath], { stdio: "inherit" });
  if (status.error) {
    console.error(`Failed to open editor: ${status.error.message}`);
    console.log(configPath);
  }
}

function saveEnvFallback(): void {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (openRouterKey) {
    saveSettings({ provider: "openrouter", apiKey: openRouterKey });
  } else if (anthropicKey) {
    saveSettings({ provider: "anthropic", apiKey: anthropicKey });
  }
}

const program = new Command();

program
  .name("bomba")
  .description("BombaCode — a CLI coding agent")
  .version(VERSION)
  .option("-m, --model <model>", "Override default model")
  .option("-p, --provider <provider>", "Override provider (openrouter|openai-compat|anthropic)")
  .option("-c, --continue", "Resume last session")
  .option("--resume <id>", "Resume a specific session by id")
  .option("--config", "Open settings")
  .argument("[prompt...]", "Initial prompt")
  .action((promptWords: string[], options: { model?: string; provider?: string; continue?: boolean; resume?: string; config?: boolean }) => {
    if (options.config) {
      openConfigInEditor();
      return;
    }

    saveEnvFallback();

    let settings = loadSettings();
    settings = applyRuntimeOverrides(settings, options);

    if (!hasApiKey(settings.provider)) {
      launchWizard(promptWords.join(" ") || undefined, options.resume);
      return;
    }

    const sessionManager = new SessionManager();
    let resumeId: string | undefined;

    if (options.resume) {
      const resumeSession = sessionManager.getById(options.resume);
      if (!resumeSession) {
        console.error(`Session not found: ${options.resume}`);
        process.exit(1);
      }
      resumeId = resumeSession.id;
    } else if (options.continue) {
      const lastSession = sessionManager.getLast();
      if (!lastSession) {
        console.error("No previous sessions found.");
        process.exit(1);
      }
      resumeId = lastSession.id;
    }

    const initialPrompt = promptWords.length > 0 ? promptWords.join(" ") : undefined;
    launchApp(settings, initialPrompt, resumeId);
  });

program
  .command("init")
  .description("Run setup wizard")
  .action(() => {
    launchWizard();
  });

const mcp = program.command("mcp").description("Manage MCP servers");

mcp
  .command("add <server>")
  .description("Add an MCP server")
  .action((server: string) => {
    const settings = loadSettings();
    const [namePart, commandPart] = server.includes("=") ? server.split("=", 2) : [server, server];

    const name = (namePart || "").trim();
    const command = (commandPart || "").trim();

    if (!name || !command) {
      console.error("Invalid server format. Use <name>=<command>.");
      process.exit(1);
    }

    const mcpServers = {
      ...settings.mcpServers,
      [name]: {
        command,
      },
    };

    saveSettings({ mcpServers });
    console.log(`Added MCP server '${name}'.`);
  });

mcp
  .command("list")
  .description("List MCP servers")
  .action(() => {
    const settings = loadSettings();
    const entries = Object.entries(settings.mcpServers);

    if (entries.length === 0) {
      console.log("No MCP servers configured.");
      return;
    }

    for (const [name, config] of entries) {
      console.log(`${name}: ${config.command}`);
    }
  });

mcp
  .command("remove <server>")
  .description("Remove an MCP server")
  .action((server: string) => {
    const settings = loadSettings();
    if (!settings.mcpServers[server]) {
      console.error(`MCP server not found: ${server}`);
      process.exit(1);
    }

    const mcpServers = { ...settings.mcpServers };
    delete mcpServers[server];
    saveSettings({ mcpServers });
    console.log(`Removed MCP server '${server}'.`);
  });

process.on("unhandledRejection", (error) => {
  logger.error("Unhandled rejection", error);
  process.exit(1);
});

program.parse();
