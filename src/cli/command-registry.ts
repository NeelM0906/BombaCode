export interface SlashCommandDefinition {
  name: string;
  description: string;
  argHint: string;
  aliases: string[];
  handler: (input: string) => void | Promise<void>;
}

function normalizeCommandName(value: string): string {
  return value.trim().toLowerCase().replace(/^\/+/, "");
}

export class SlashCommandRegistry {
  private readonly commands = new Map<string, SlashCommandDefinition>();
  private readonly aliasToName = new Map<string, string>();

  register(command: SlashCommandDefinition): void {
    const name = normalizeCommandName(command.name);
    if (!name) {
      throw new Error("Command name cannot be empty");
    }

    if (this.commands.has(name) || this.aliasToName.has(name)) {
      throw new Error(`Slash command "${name}" is already registered`);
    }

    const normalizedAliases = command.aliases.map((alias) => normalizeCommandName(alias)).filter(Boolean);
    for (const alias of normalizedAliases) {
      if (alias === name) {
        throw new Error(`Alias "${alias}" cannot match command name`);
      }
      if (this.commands.has(alias) || this.aliasToName.has(alias)) {
        throw new Error(`Alias "${alias}" is already registered`);
      }
    }

    const normalized: SlashCommandDefinition = {
      ...command,
      name,
      aliases: normalizedAliases,
    };

    this.commands.set(name, normalized);
    for (const alias of normalizedAliases) {
      this.aliasToName.set(alias, name);
    }
  }

  getAll(): SlashCommandDefinition[] {
    return Array.from(this.commands.values());
  }

  getCommand(nameOrAlias: string): SlashCommandDefinition | undefined {
    const key = normalizeCommandName(nameOrAlias);
    if (!key) {
      return undefined;
    }

    const direct = this.commands.get(key);
    if (direct) {
      return direct;
    }

    const mappedName = this.aliasToName.get(key);
    return mappedName ? this.commands.get(mappedName) : undefined;
  }

  filterByPrefix(prefix: string): SlashCommandDefinition[] {
    const normalizedPrefix = normalizeCommandName(prefix);
    const results: SlashCommandDefinition[] = [];

    for (const command of this.commands.values()) {
      if (!normalizedPrefix) {
        results.push(command);
        continue;
      }

      if (command.name.startsWith(normalizedPrefix)) {
        results.push(command);
        continue;
      }

      if (command.aliases.some((alias) => alias.startsWith(normalizedPrefix))) {
        results.push(command);
      }
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  isSlashCommand(input: string): boolean {
    return input.trim().startsWith("/");
  }

  async execute(input: string): Promise<boolean> {
    const trimmed = input.trim();
    if (!this.isSlashCommand(trimmed)) {
      return false;
    }

    const token = normalizeCommandName(trimmed.split(/\s+/, 1)[0] ?? "");
    const command = this.getCommand(token);
    if (!command) {
      return false;
    }

    await command.handler(trimmed);
    return true;
  }
}
