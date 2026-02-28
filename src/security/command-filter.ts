export interface DangerousCommandResult {
  dangerous: boolean;
  reason?: string;
}

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+-rf\s+\/?(\s|$)/i, reason: "Destructive root deletion command detected." },
  { pattern: /\brm\s+-rf\s+~(\s|$)/i, reason: "Destructive home-directory deletion command detected." },
  { pattern: /:.*\(\)\s*\{\s*:.*\|.*:\s*&\s*\};\s*:/, reason: "Fork bomb pattern detected." },
  { pattern: /\bmkfs(\.|\s|$)/i, reason: "Filesystem formatting command detected." },
  { pattern: /\bdd\s+if=\/dev\/zero/i, reason: "Disk overwrite command detected." },
  { pattern: /\b(chmod\s+777\s+\/?)(\s|$)/i, reason: "Dangerous root permission escalation detected." },
  { pattern: /\b(modprobe|insmod|rmmod)\b/i, reason: "Kernel module operation detected." },
  {
    pattern: /\bcurl\b[^\n]*\s(-X\s+POST|--request\s+POST)\b/i,
    reason: "Outbound POST request detected. Review before allowing.",
  },
  {
    pattern: /\bwget\b[^\n]*\s--post-data\b/i,
    reason: "Outbound POST request detected. Review before allowing.",
  },
  { pattern: /\b(sudo\s+rm|sudo\s+mkfs|sudo\s+dd)\b/i, reason: "Privileged destructive command detected." },
  { pattern: />\s*\/dev\/(sda|nvme\d+n\d+)/i, reason: "Direct write to block device detected." },
];

export function sanitizeCommand(command: string): string {
  return command
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isDangerousCommand(command: string): DangerousCommandResult {
  const normalized = sanitizeCommand(command);

  for (const candidate of DANGEROUS_PATTERNS) {
    if (candidate.pattern.test(normalized)) {
      return { dangerous: true, reason: candidate.reason };
    }
  }

  return { dangerous: false };
}

export function isCommandSafe(command: string): boolean {
  return !isDangerousCommand(command).dangerous;
}
