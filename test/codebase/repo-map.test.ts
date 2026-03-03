import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pageRank, RepoMapManager } from "../../src/codebase/repo-map.js";

// ─── PageRank Tests ───

describe("pageRank", () => {
  it("computes scores for a simple linear graph A→B→C", () => {
    const graph = new Map<string, Set<string>>([
      ["A", new Set(["B"])],
      ["B", new Set(["C"])],
      ["C", new Set()],
    ]);

    const scores = pageRank(graph);

    // C should have the highest score (most upstream dependencies)
    // B should be in the middle, A should be lowest
    expect(scores.get("C")!).toBeGreaterThan(scores.get("B")!);
    expect(scores.get("B")!).toBeGreaterThan(scores.get("A")!);
  });

  it("computes scores for a fan-in graph (many files import one)", () => {
    const graph = new Map<string, Set<string>>([
      ["A", new Set(["D"])],
      ["B", new Set(["D"])],
      ["C", new Set(["D"])],
      ["D", new Set()],
    ]);

    const scores = pageRank(graph);

    // D should have the highest score since A, B, and C all point to it
    const dScore = scores.get("D")!;
    expect(dScore).toBeGreaterThan(scores.get("A")!);
    expect(dScore).toBeGreaterThan(scores.get("B")!);
    expect(dScore).toBeGreaterThan(scores.get("C")!);
  });

  it("handles an empty graph", () => {
    const graph = new Map<string, Set<string>>();
    const scores = pageRank(graph);
    expect(scores.size).toBe(0);
  });

  it("handles a single node graph", () => {
    const graph = new Map<string, Set<string>>([["A", new Set()]]);
    const scores = pageRank(graph);
    expect(scores.size).toBe(1);
    expect(scores.get("A")).toBeCloseTo(1, 2);
  });

  it("handles cyclic graphs", () => {
    const graph = new Map<string, Set<string>>([
      ["A", new Set(["B"])],
      ["B", new Set(["C"])],
      ["C", new Set(["A"])],
    ]);

    const scores = pageRank(graph);

    // In a cycle, all nodes should have roughly equal scores
    const aScore = scores.get("A")!;
    const bScore = scores.get("B")!;
    const cScore = scores.get("C")!;
    expect(Math.abs(aScore - bScore)).toBeLessThan(0.05);
    expect(Math.abs(bScore - cScore)).toBeLessThan(0.05);
  });

  it("applies personalization to boost specific files", () => {
    const graph = new Map<string, Set<string>>([
      ["A", new Set(["C"])],
      ["B", new Set(["C"])],
      ["C", new Set()],
    ]);

    const personalization = new Map<string, number>([["A", 1]]);
    const scores = pageRank(graph, personalization);

    // A should have a boosted score compared to non-personalized
    const scoresDefault = pageRank(graph);
    expect(scores.get("A")!).toBeGreaterThan(scoresDefault.get("A")!);
  });

  it("scores sum to approximately 1 (normalized)", () => {
    const graph = new Map<string, Set<string>>([
      ["A", new Set(["B", "C"])],
      ["B", new Set(["C"])],
      ["C", new Set(["A"])],
      ["D", new Set(["B"])],
    ]);

    const scores = pageRank(graph);
    let total = 0;
    for (const score of scores.values()) {
      total += score;
    }
    expect(total).toBeCloseTo(1, 2);
  });
});

// ─── RepoMapManager Tests ───

describe("RepoMapManager", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `repo-map-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function writeFile(relPath: string, content: string): void {
    const absPath = join(tmpDir, relPath);
    mkdirSync(join(absPath, ".."), { recursive: true });
    writeFileSync(absPath, content, "utf-8");
  }

  it("builds a repo map from TypeScript files", async () => {
    writeFile("src/index.ts", `
import { Logger } from "./logger";
export function main(): void {
  const log = new Logger();
}
`);
    writeFile("src/logger.ts", `
export class Logger {
  log(message: string): void {
    console.log(message);
  }
}
`);

    const manager = new RepoMapManager(tmpDir, 1024, 5);
    const map = await manager.getRepoMap();

    expect(map).toContain("src/logger.ts");
    expect(map).toContain("src/index.ts");
    expect(map).toContain("Logger");
  });

  it("respects token budget", async () => {
    // Create many files to exceed a small budget
    for (let i = 0; i < 20; i++) {
      writeFile(`src/module${i}.ts`, `
export function func${i}(): void {}
export class Class${i} {
  method${i}(): void {}
}
export interface Interface${i} {
  field: string;
}
`);
    }

    const manager = new RepoMapManager(tmpDir, 100, 5); // Very small budget
    const map = await manager.getRepoMap(100);

    // With a 100-token budget, not all 20 files should appear
    const fileCount = (map.match(/src\/module\d+\.ts/g) || []).length;
    expect(fileCount).toBeLessThan(20);
    expect(fileCount).toBeGreaterThan(0);
  });

  it("tracks file changes and incremental refresh", async () => {
    writeFile("src/app.ts", `export function app(): void {}`);

    const manager = new RepoMapManager(tmpDir, 1024, 5);
    await manager.getRepoMap();

    expect(manager.getFileCount()).toBe(1);

    // Add a new file
    writeFile("src/helper.ts", `export function help(): void {}`);
    manager.markFileChanged("src/helper.ts");
    await manager.refresh();

    const map = await manager.getRepoMap();
    expect(map).toContain("src/helper.ts");
    expect(manager.getFileCount()).toBe(2);
  });

  it("shouldRefresh returns true at correct intervals", () => {
    const manager = new RepoMapManager(tmpDir, 1024, 5);

    // Should not refresh at edit count 0
    expect(manager.shouldRefresh()).toBe(false);

    // Mark files changed
    for (let i = 0; i < 4; i++) {
      manager.markFileChanged(`file${i}.ts`);
    }
    expect(manager.shouldRefresh()).toBe(false);

    // 5th edit triggers refresh
    manager.markFileChanged("file4.ts");
    expect(manager.shouldRefresh()).toBe(true);
  });

  it("formats repo map output as a tree", async () => {
    writeFile("src/app.ts", `
export function startApp(): void {}
export class AppServer {
  listen(): void {}
}
`);

    const manager = new RepoMapManager(tmpDir, 1024, 5);
    const map = await manager.getRepoMap();

    // Check tree-like formatting
    expect(map).toContain("src/app.ts");
    expect(map).toContain("startApp");
    expect(map).toContain("AppServer");
    expect(map).toMatch(/[├└]──/); // Tree characters
    expect(map).toContain("(function)");
    expect(map).toContain("(class)");
  });

  it("ranks important files higher", async () => {
    // logger.ts is imported by both app.ts and service.ts — should rank highest
    writeFile("src/logger.ts", `
export class Logger {
  log(msg: string): void {}
}
`);
    writeFile("src/app.ts", `
import { Logger } from "./logger";
export function main(): void {}
`);
    writeFile("src/service.ts", `
import { Logger } from "./logger";
export class Service {}
`);

    const manager = new RepoMapManager(tmpDir, 1024, 5);
    const map = await manager.getRepoMap();

    // logger.ts should appear before app.ts and service.ts (ranked higher by PageRank)
    const loggerPos = map.indexOf("src/logger.ts");
    const appPos = map.indexOf("src/app.ts");
    const servicePos = map.indexOf("src/service.ts");

    expect(loggerPos).toBeGreaterThanOrEqual(0);
    expect(loggerPos).toBeLessThan(appPos);
    expect(loggerPos).toBeLessThan(servicePos);
  });

  it("applies personalization to boost specific files", async () => {
    writeFile("src/a.ts", `export function a(): void {}`);
    writeFile("src/b.ts", `export function b(): void {}`);
    writeFile("src/c.ts", `export function c(): void {}`);

    const manager = new RepoMapManager(tmpDir, 1024, 5);

    // Without personalization, files have roughly equal scores
    const map1 = await manager.getRepoMap(1024);

    // With personalization, boosted file should appear first
    const map2 = await manager.getRepoMap(1024, ["src/c.ts"]);
    const cPos = map2.indexOf("src/c.ts");
    expect(cPos).toBe(0); // c.ts should be at the start since it's personalized
  });

  it("handles Python files", async () => {
    writeFile("app/main.py", `
from .utils import helper

def main():
    helper()

class App:
    def run(self):
        pass
`);
    writeFile("app/utils.py", `
def helper():
    return True
`);

    const manager = new RepoMapManager(tmpDir, 1024, 5);
    const map = await manager.getRepoMap();

    expect(map).toContain("app/main.py");
    expect(map).toContain("main");
    expect(map).toContain("App");
  });

  it("handles empty project directory", async () => {
    const manager = new RepoMapManager(tmpDir, 1024, 5);
    const map = await manager.getRepoMap();
    expect(map).toBe("");
  });

  it("caches results to disk", async () => {
    writeFile("src/app.ts", `export function app(): void {}`);

    const manager1 = new RepoMapManager(tmpDir, 1024, 5);
    await manager1.getRepoMap();

    // Create a second manager that should load from disk cache
    const manager2 = new RepoMapManager(tmpDir, 1024, 5);
    const map = await manager2.getRepoMap();
    expect(map).toContain("src/app.ts");
  });
});
