import type { Settings } from "../memory/settings.js";

export class ModelRouter {
  select(settings: Settings): string {
    switch (settings.costMode) {
      case "quality-first":
        return settings.models.powerful;
      case "cost-first":
        return settings.models.fast;
      default:
        return settings.models.balanced;
    }
  }
}
