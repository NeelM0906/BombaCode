import type { HookEvent, HookHandler, HookContext } from "./types.js";

export class HookManager {
  private readonly hooks = new Map<HookEvent, HookHandler[]>();

  register(event: HookEvent, handler: HookHandler): void {
    const handlers = this.hooks.get(event) ?? [];
    handlers.push(handler);
    this.hooks.set(event, handlers);
  }

  async run(event: HookEvent, payload?: Record<string, unknown>): Promise<void> {
    const handlers = this.hooks.get(event) ?? [];
    const context: HookContext = { event, payload };
    for (const handler of handlers) {
      await handler(context);
    }
  }
}
