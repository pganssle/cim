import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const repo_root = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(repo_root, "node_modules", "news-fragments", "src", "cli", "index.js");

test("news-fragments compiles and removes pending changelog entries", async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Changelog compilation only needs one Node runtime.");

    const worktree = await mkdtemp(join(tmpdir(), "cim-changelog-"));
    try {
        const package_config = JSON.parse(
            await readFile(join(repo_root, "package.json"), "utf8"));
        await writeFile(join(worktree, "package.json"), JSON.stringify({
            name: "cim-changelog-test",
            private: true,
            type: "module",
            "release-it": package_config["release-it"],
        }));
        await mkdir(join(worktree, "changelog.d"));
        await writeFile(join(worktree, "changelog.d", "README"), "Contributor instructions.");
        await writeFile(join(worktree, "changelog.d", "first.md"), "Added the first change.");
        await writeFile(join(worktree, "changelog.d", "second.md"), "Fixed the second change.");
        await writeFile(join(worktree, "NEWS.md"), "## 2025-01-01\n\n- An older change.\n");

        const result = spawnSync(process.execPath, [cli, "burn", "2099-12-31"], {
            cwd: worktree,
            encoding: "utf8",
        });
        expect(result.status, result.stderr || result.stdout).toBe(0);

        const news = await readFile(join(worktree, "NEWS.md"), "utf8");
        expect(news).toMatch(/^\s*\[\/\/\]: # \(s-2099-12-31\)/);
        expect(news).toContain("## 2099-12-31");
        expect(news).toContain("- Added the first change.");
        expect(news).toContain("- Fixed the second change.");
        expect(news.indexOf("## 2099-12-31")).toBeLessThan(news.indexOf("## 2025-01-01"));
        await expect(readdir(join(worktree, "changelog.d"))).resolves.toEqual(["README"]);
    } finally {
        await rm(worktree, { recursive: true, force: true });
    }
});
