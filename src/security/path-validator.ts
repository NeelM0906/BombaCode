import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

function isWithinRoot(resolvedPath: string, projectRoot: string): boolean {
  const root = resolve(projectRoot);
  const target = resolve(resolvedPath);
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function resolvePathForValidation(filePath: string): Promise<string> {
  const absolute = resolve(filePath);

  try {
    return await realpath(absolute);
  } catch {
    const parent = dirname(absolute);
    const parentRealPath = await realpath(parent).catch(() => resolve(parent));
    return resolve(parentRealPath, basename(absolute));
  }
}

export async function isPathAllowed(filePath: string, projectRoot: string): Promise<boolean> {
  const normalizedTarget = await resolvePathForValidation(filePath);
  const normalizedRoot = await resolvePathForValidation(projectRoot);
  return isWithinRoot(normalizedTarget, normalizedRoot);
}

export async function resolveToolPath(
  filePath: string,
  cwd: string,
  projectRoot: string
): Promise<string> {
  const resolvedPath = resolve(cwd, filePath);
  const allowed = await isPathAllowed(resolvedPath, projectRoot);

  if (!allowed) {
    throw new Error(`Path is outside the project root and is not allowed: ${filePath}`);
  }

  return resolvedPath;
}
