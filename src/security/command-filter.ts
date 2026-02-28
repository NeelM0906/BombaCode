const BLOCKED_COMMANDS = ["rm -rf /", "mkfs", "shutdown", "reboot"];

export function isCommandSafe(command: string): boolean {
  return !BLOCKED_COMMANDS.some((blocked) => command.includes(blocked));
}
