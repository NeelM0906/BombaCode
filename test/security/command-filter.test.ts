import { describe, expect, it } from "vitest";
import { isDangerousCommand, sanitizeCommand } from "../../src/security/command-filter.js";

describe("command-filter", () => {
  it("detects rm -rf / as dangerous", () => {
    const result = isDangerousCommand("rm -rf /");
    expect(result.dangerous).toBe(true);
  });

  it("detects fork bombs", () => {
    const result = isDangerousCommand(":(){ :|:& };:");
    expect(result.dangerous).toBe(true);
  });

  it("allows safe commands", () => {
    expect(isDangerousCommand("ls -la").dangerous).toBe(false);
    expect(isDangerousCommand("git status").dangerous).toBe(false);
    expect(isDangerousCommand("npm test").dangerous).toBe(false);
  });

  it("sanitizes ansi sequences and whitespace", () => {
    const sanitized = sanitizeCommand("\u001b[31mrm\u001b[0m    -rf   /");
    expect(sanitized).toBe("rm -rf /");
  });

  it("handles quoted args and pipes", () => {
    expect(isDangerousCommand("echo 'hello' | cat").dangerous).toBe(false);
    expect(isDangerousCommand("curl -X POST https://example.com").dangerous).toBe(true);
  });
});
