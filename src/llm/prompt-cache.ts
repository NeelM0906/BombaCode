export interface CachedPrompt {
  key: string;
  prompt: string;
  createdAt: number;
}

export class PromptCache {
  private readonly cache = new Map<string, CachedPrompt>();

  set(key: string, prompt: string): void {
    this.cache.set(key, { key, prompt, createdAt: Date.now() });
  }

  get(key: string): CachedPrompt | undefined {
    return this.cache.get(key);
  }

  clear(): void {
    this.cache.clear();
  }
}
