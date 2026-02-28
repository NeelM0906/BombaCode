import { resolve } from "node:path";

export function isPathWithin(root: string, target: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  return resolvedTarget.startsWith(resolvedRoot);
}
