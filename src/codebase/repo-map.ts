import { globby } from "globby";
import { readFileSync, statSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve, dirname, extname } from "node:path";
import { TokenCounter } from "../llm/token-counter.js";
import { extractSymbols } from "./symbol-extractor.js";
import { getSupportedExtensions } from "./tree-sitter.js";
import { logger } from "../utils/logger.js";
import type { FileSymbols, SymbolInfo } from "./symbol-extractor.js";

// ─── Types ───

interface CachedFileSymbols {
  mtime: number;
  symbols: FileSymbols;
}

interface DiskCache {
  version: number;
  files: Record<string, CachedFileSymbols>;
}

// ─── Legacy API (backward compat) ───

export async function buildRepoMap(cwd: string): Promise<string[]> {
  return globby(["**/*"], { cwd, dot: true, gitignore: true, onlyFiles: true });
}

// ─── Layer 1: File Discovery + Parsing ───

/**
 * Discover all supported source files in the project, respecting .gitignore.
 */
async function discoverSourceFiles(cwd: string): Promise<string[]> {
  const extensions = getSupportedExtensions();
  const patterns = extensions.map((ext) => `**/*${ext}`);

  const files = await globby(patterns, {
    cwd,
    gitignore: true,
    onlyFiles: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**", "**/coverage/**"],
  });

  return files.map((f) => resolve(cwd, f));
}

/**
 * Parse a single file and extract its symbols, using mtime-based caching.
 */
function parseFileWithCache(
  filePath: string,
  cwd: string,
  cache: Map<string, CachedFileSymbols>,
): FileSymbols | null {
  try {
    const stat = statSync(filePath);
    const mtime = stat.mtimeMs;
    const relPath = relative(cwd, filePath);

    const cached = cache.get(relPath);
    if (cached && cached.mtime === mtime) {
      return cached.symbols;
    }

    const source = readFileSync(filePath, "utf-8");
    const symbols = extractSymbols(relPath, source);

    cache.set(relPath, { mtime, symbols });
    return symbols;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to parse ${filePath}`, { error: message });
    return null;
  }
}

// ─── Layer 2: Graph Construction ───

/**
 * Build a directed graph: file A → file B means A imports/references something from B.
 * Nodes are relative file paths; edges represent import relationships.
 */
function buildDependencyGraph(
  allSymbols: Map<string, FileSymbols>,
  cwd: string,
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  // Initialize all files as nodes
  for (const relPath of allSymbols.keys()) {
    graph.set(relPath, new Set());
  }

  // Build a map from possible import paths to actual file paths
  const fileByImportPath = new Map<string, string>();
  for (const relPath of allSymbols.keys()) {
    // Register without extension: "./foo/bar" matches "foo/bar.ts"
    const withoutExt = relPath.replace(/\.(ts|tsx|js|jsx|mjs|cjs|py)$/, "");
    fileByImportPath.set(withoutExt, relPath);

    // Also register index files: "./foo" matches "foo/index.ts"
    if (relPath.endsWith("/index.ts") || relPath.endsWith("/index.js")) {
      const dirPath = withoutExt.replace(/\/index$/, "");
      fileByImportPath.set(dirPath, relPath);
    }
  }

  // Connect edges based on import references
  for (const [relPath, symbols] of allSymbols) {
    const edges = graph.get(relPath)!;
    const fileDir = dirname(relPath);

    for (const ref of symbols.references) {
      // Resolve the relative import path
      const resolvedImport = resolve("/", fileDir, ref).slice(1); // Remove leading /
      const normalizedImport = resolvedImport.replace(/\.(ts|tsx|js|jsx|mjs|cjs|py)$/, "");

      const targetFile = fileByImportPath.get(normalizedImport);
      if (targetFile && targetFile !== relPath) {
        edges.add(targetFile);
      }
    }
  }

  return graph;
}

// ─── Layer 3: PageRank ───

/**
 * Compute PageRank scores for all nodes in the graph.
 * Higher score = more important file (more things depend on it).
 */
export function pageRank(
  graph: Map<string, Set<string>>,
  personalization?: Map<string, number>,
  damping: number = 0.85,
  iterations: number = 20,
): Map<string, number> {
  const nodes = Array.from(graph.keys());
  const n = nodes.length;

  if (n === 0) return new Map();

  // Initialize scores
  const scores = new Map<string, number>();
  const defaultScore = 1 / n;
  for (const node of nodes) {
    scores.set(node, defaultScore);
  }

  // Build reverse graph: target → set of sources (who points to target)
  const reverseGraph = new Map<string, Set<string>>();
  for (const node of nodes) {
    reverseGraph.set(node, new Set());
  }
  for (const [source, targets] of graph) {
    for (const target of targets) {
      reverseGraph.get(target)?.add(source);
    }
  }

  // Compute personalization vector
  let persVector: Map<string, number>;
  if (personalization && personalization.size > 0) {
    persVector = new Map<string, number>();
    let total = 0;
    for (const node of nodes) {
      const val = personalization.get(node) ?? 0;
      persVector.set(node, val);
      total += val;
    }
    // Normalize, but add a small uniform base so all nodes have non-zero probability
    if (total > 0) {
      const uniformBase = 0.1 / n;
      for (const node of nodes) {
        persVector.set(node, uniformBase + (0.9 * (persVector.get(node) ?? 0)) / total);
      }
    } else {
      for (const node of nodes) {
        persVector.set(node, defaultScore);
      }
    }
  } else {
    persVector = new Map(nodes.map((node) => [node, defaultScore]));
  }

  // Iterative PageRank
  for (let iter = 0; iter < iterations; iter++) {
    const newScores = new Map<string, number>();

    for (const node of nodes) {
      let incomingSum = 0;
      const incomingNodes = reverseGraph.get(node);
      if (incomingNodes) {
        for (const source of incomingNodes) {
          const outDegree = graph.get(source)?.size ?? 1;
          incomingSum += (scores.get(source) ?? 0) / outDegree;
        }
      }

      const persScore = persVector.get(node) ?? defaultScore;
      newScores.set(node, (1 - damping) * persScore + damping * incomingSum);
    }

    // Normalize to prevent score decay
    let total = 0;
    for (const score of newScores.values()) {
      total += score;
    }
    if (total > 0) {
      for (const [node, score] of newScores) {
        newScores.set(node, score / total);
      }
    }

    // Update scores
    for (const [node, score] of newScores) {
      scores.set(node, score);
    }
  }

  return scores;
}

// ─── Layer 4: Token-Budgeted Output ───

/**
 * Format the repo map as a tree-like string that fits within a token budget.
 */
function formatRepoMap(
  rankedFiles: Array<{ filePath: string; symbols: FileSymbols; score: number }>,
  maxTokens: number,
  tokenCounter: TokenCounter,
): string {
  if (rankedFiles.length === 0) return "";

  // Format each file entry
  const entries: string[] = [];
  for (const { filePath, symbols } of rankedFiles) {
    const defs = symbols.definitions;
    if (defs.length === 0) {
      entries.push(filePath);
      continue;
    }

    const lines: string[] = [filePath];
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i]!;
      const prefix = i === defs.length - 1 ? "  \u2514\u2500\u2500 " : "  \u251C\u2500\u2500 ";
      const kindLabel = def.kind === "method" ? "method" : def.kind;
      lines.push(`${prefix}${def.name} (${kindLabel})`);
    }

    entries.push(lines.join("\n"));
  }

  // Binary search for the maximum number of files that fit in the budget
  let low = 1;
  let high = entries.length;
  let bestFit = 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = entries.slice(0, mid).join("\n\n");
    const tokens = tokenCounter.estimateTokens(candidate);

    if (tokens <= maxTokens) {
      bestFit = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return entries.slice(0, bestFit).join("\n\n");
}

// ─── Disk Cache ───

const CACHE_VERSION = 1;
const CACHE_FILENAME = "repo-map-cache.json";

function getCachePath(cwd: string): string {
  return join(cwd, ".bomba", CACHE_FILENAME);
}

function loadDiskCache(cwd: string): Map<string, CachedFileSymbols> {
  const cachePath = getCachePath(cwd);
  try {
    if (existsSync(cachePath)) {
      const raw = JSON.parse(readFileSync(cachePath, "utf-8")) as DiskCache;
      if (raw.version === CACHE_VERSION) {
        return new Map(Object.entries(raw.files));
      }
    }
  } catch {
    // Corrupted cache, start fresh
  }
  return new Map();
}

function saveDiskCache(cwd: string, cache: Map<string, CachedFileSymbols>): void {
  const cachePath = getCachePath(cwd);
  try {
    const dir = dirname(cachePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const data: DiskCache = {
      version: CACHE_VERSION,
      files: Object.fromEntries(cache),
    };

    writeFileSync(cachePath, JSON.stringify(data), "utf-8");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Failed to save repo map cache", { error: message });
  }
}

// ─── RepoMapManager ───

export class RepoMapManager {
  private readonly cwd: string;
  private readonly tokenCounter: TokenCounter;
  private readonly defaultMaxTokens: number;
  private readonly refreshInterval: number;
  private cache: Map<string, CachedFileSymbols>;
  private allSymbols: Map<string, FileSymbols> = new Map();
  private changedFiles: Set<string> = new Set();
  private editCount = 0;
  private initialized = false;
  private lastMap = "";

  constructor(cwd: string, maxTokens: number = 1024, refreshInterval: number = 5) {
    this.cwd = cwd;
    this.tokenCounter = new TokenCounter();
    this.defaultMaxTokens = maxTokens;
    this.refreshInterval = refreshInterval;
    this.cache = loadDiskCache(cwd);
  }

  /**
   * Initialize by scanning all source files. Called lazily on first getRepoMap().
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    const files = await discoverSourceFiles(this.cwd);
    for (const file of files) {
      const symbols = parseFileWithCache(file, this.cwd, this.cache);
      if (symbols) {
        this.allSymbols.set(symbols.filePath, symbols);
      }
    }

    saveDiskCache(this.cwd, this.cache);
    this.initialized = true;
    logger.info("Repo map initialized", { fileCount: this.allSymbols.size });
  }

  /**
   * Mark a file as changed (e.g., after a write/edit tool call).
   */
  markFileChanged(filePath: string): void {
    const relPath = relative(this.cwd, resolve(this.cwd, filePath));
    this.changedFiles.add(relPath);
    this.editCount++;
  }

  /**
   * Check whether a refresh should happen based on edit count.
   */
  shouldRefresh(editCount?: number): boolean {
    const count = editCount ?? this.editCount;
    return count > 0 && count % this.refreshInterval === 0;
  }

  /**
   * Incrementally refresh: re-parse only changed files, rebuild graph and scores.
   */
  async refresh(): Promise<void> {
    if (this.changedFiles.size === 0 && this.initialized) return;

    if (!this.initialized) {
      await this.initialize();
      return;
    }

    // Re-parse changed files
    for (const relPath of this.changedFiles) {
      const absPath = resolve(this.cwd, relPath);
      try {
        if (existsSync(absPath)) {
          const symbols = parseFileWithCache(absPath, this.cwd, this.cache);
          if (symbols) {
            this.allSymbols.set(symbols.filePath, symbols);
          }
        } else {
          // File was deleted
          this.allSymbols.delete(relPath);
          this.cache.delete(relPath);
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // Check for new files that didn't exist before
    const currentFiles = await discoverSourceFiles(this.cwd);
    for (const file of currentFiles) {
      const relPath = relative(this.cwd, file);
      if (!this.allSymbols.has(relPath)) {
        const symbols = parseFileWithCache(file, this.cwd, this.cache);
        if (symbols) {
          this.allSymbols.set(symbols.filePath, symbols);
        }
      }
    }

    this.changedFiles.clear();
    saveDiskCache(this.cwd, this.cache);

    logger.info("Repo map refreshed", { fileCount: this.allSymbols.size });
  }

  /**
   * Generate the repo map string, respecting the token budget.
   * Personalized files (e.g., files in conversation or recently edited) get boosted scores.
   */
  async getRepoMap(maxTokens?: number, personalizedFiles?: string[]): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    const budget = maxTokens ?? this.defaultMaxTokens;

    // Build graph
    const graph = buildDependencyGraph(this.allSymbols, this.cwd);

    // Build personalization vector
    let personalization: Map<string, number> | undefined;
    if (personalizedFiles && personalizedFiles.length > 0) {
      personalization = new Map<string, number>();
      for (const file of personalizedFiles) {
        const relPath = relative(this.cwd, resolve(this.cwd, file));
        personalization.set(relPath, 1);
      }
    }

    // Compute PageRank scores
    const scores = pageRank(graph, personalization);

    // Sort by score descending
    const ranked = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([filePath, score]) => ({
        filePath,
        symbols: this.allSymbols.get(filePath) ?? { filePath, definitions: [], references: [] },
        score,
      }));

    // Format within token budget
    this.lastMap = formatRepoMap(ranked, budget, this.tokenCounter);
    return this.lastMap;
  }

  /**
   * Get the last generated map without recomputing.
   */
  getLastMap(): string {
    return this.lastMap;
  }

  /**
   * Get the current edit count.
   */
  getEditCount(): number {
    return this.editCount;
  }

  /**
   * Reset edit counter (e.g., after a refresh).
   */
  resetEditCount(): void {
    this.editCount = 0;
  }

  /**
   * Get the number of tracked files.
   */
  getFileCount(): number {
    return this.allSymbols.size;
  }
}
