import { describe, expect, it, vi } from "vitest";
import { SlashCommandRegistry } from "../../src/cli/command-registry.js";

describe("SlashCommandRegistry", () => {
  it("registers commands and resolves aliases", () => {
    const registry = new SlashCommandRegistry();
    const handler = vi.fn();

    registry.register({
      name: "exit",
      description: "Exit app",
      argHint: "",
      aliases: ["quit"],
      handler,
    });

    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getCommand("exit")?.name).toBe("exit");
    expect(registry.getCommand("quit")?.name).toBe("exit");
  });

  it("filters commands by prefix and alias prefix", () => {
    const registry = new SlashCommandRegistry();
    const noop = vi.fn();

    registry.register({
      name: "clear",
      description: "clear",
      argHint: "",
      aliases: [],
      handler: noop,
    });
    registry.register({
      name: "mode",
      description: "mode",
      argHint: "<m>",
      aliases: [],
      handler: noop,
    });
    registry.register({
      name: "exit",
      description: "exit",
      argHint: "",
      aliases: ["quit"],
      handler: noop,
    });

    expect(registry.filterByPrefix("cl").map((command) => command.name)).toEqual(["clear"]);
    expect(registry.filterByPrefix("qu").map((command) => command.name)).toEqual(["exit"]);
    expect(registry.filterByPrefix("")).toHaveLength(3);
  });

  it("executes registered slash command and returns handled state", async () => {
    const registry = new SlashCommandRegistry();
    const handler = vi.fn();

    registry.register({
      name: "mode",
      description: "Set mode",
      argHint: "<normal|yolo>",
      aliases: [],
      handler,
    });

    await expect(registry.execute("/mode yolo")).resolves.toBe(true);
    expect(handler).toHaveBeenCalledWith("/mode yolo");

    await expect(registry.execute("plain text")).resolves.toBe(false);
    await expect(registry.execute("/unknown")).resolves.toBe(false);
  });

  it("detects slash command input", () => {
    const registry = new SlashCommandRegistry();

    expect(registry.isSlashCommand("/help")).toBe(true);
    expect(registry.isSlashCommand(" /help ")).toBe(true);
    expect(registry.isSlashCommand("help")).toBe(false);
  });

  it("rejects duplicate command names and aliases", () => {
    const registry = new SlashCommandRegistry();
    const noop = vi.fn();

    registry.register({
      name: "exit",
      description: "Exit app",
      argHint: "",
      aliases: ["quit"],
      handler: noop,
    });

    expect(() =>
      registry.register({
        name: "exit",
        description: "Duplicate",
        argHint: "",
        aliases: [],
        handler: noop,
      })
    ).toThrow("already registered");

    expect(() =>
      registry.register({
        name: "leave",
        description: "Duplicate alias",
        argHint: "",
        aliases: ["quit"],
        handler: noop,
      })
    ).toThrow("already registered");
  });
});
