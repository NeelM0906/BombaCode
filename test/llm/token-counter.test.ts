import { describe, expect, it } from "vitest";
import { TokenCounter } from "../../src/llm/token-counter.js";

describe("TokenCounter", () => {
  it("estimates non-zero token count for text", () => {
    const counter = new TokenCounter();
    expect(counter.estimateTokens("hello world")).toBeGreaterThan(0);
  });

  it("estimates message arrays", () => {
    const counter = new TokenCounter();
    const tokens = counter.estimateMessages([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ]);

    expect(tokens).toBeGreaterThan(0);
  });
});
