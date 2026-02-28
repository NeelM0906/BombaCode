import type { Settings } from "../memory/settings.js";
import type { LLMProvider } from "./types.js";
import { OpenRouterProvider } from "./openrouter.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAICompatProvider } from "./openai-compat.js";

/**
 * Create an LLM provider based on current settings
 */
export function createProvider(settings: Settings): LLMProvider {
  switch (settings.provider) {
    case "openrouter": {
      const apiKey = settings.apiKey || process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error("No OpenRouter API key configured. Run `bomba init` to set up.");
      }
      return new OpenRouterProvider(apiKey);
    }
    case "anthropic": {
      const apiKey = settings.apiKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("No Anthropic API key configured. Run `bomba init` to set up.");
      }
      return new AnthropicProvider(apiKey);
    }
    case "openai-compat":
      return new OpenAICompatProvider(settings.openAICompatBaseUrl, settings.apiKey);
    default:
      throw new Error(`Unknown provider: ${settings.provider}`);
  }
}
