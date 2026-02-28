import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isPathAllowed, resolveToolPath } from "../../src/security/path-validator.js";

describe("path-validator", () => {
  it("allows paths within project root", async () => {
    const root = await mkdtemp(join(process.cwd(), ".bomba-path-"));
    const filePath = join(root, "a", "b.ts");

    try {
      await mkdir(join(root, "a"), { recursive: true });
      await writeFile(filePath, "ok", "utf8");

      expect(await isPathAllowed(filePath, root)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("blocks path traversal outside root", async () => {
    const root = await mkdtemp(join(process.cwd(), ".bomba-path-"));

    try {
      const allowed = await isPathAllowed(join(root, "..", "outside.txt"), root);
      expect(allowed).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("resolves relative paths correctly", async () => {
    const root = await mkdtemp(join(process.cwd(), ".bomba-path-"));

    try {
      const resolved = await resolveToolPath("src/index.ts", root, root);
      expect(resolved).toContain(join(root, "src", "index.ts"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("blocks symlinks resolving outside root", async () => {
    const root = await mkdtemp(join(process.cwd(), ".bomba-path-"));
    const outside = await mkdtemp(join(process.cwd(), ".bomba-path-outside-"));

    try {
      const outsideTarget = join(outside, "secret.txt");
      await writeFile(outsideTarget, "secret", "utf8");

      const linkPath = join(root, "linked.txt");
      await symlink(outsideTarget, linkPath);

      const allowed = await isPathAllowed(linkPath, root);
      expect(allowed).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
