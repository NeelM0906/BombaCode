import { globby } from "globby";

export async function buildRepoMap(cwd: string): Promise<string[]> {
  return globby(["**/*"], { cwd, dot: true, gitignore: true, onlyFiles: true });
}
