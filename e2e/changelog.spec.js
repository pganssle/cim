import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const repo_root = dirname(dirname(fileURLToPath(import.meta.url)));
const script = join(repo_root, "scripts", "update_changelog.mjs");
const released_news = `## Android Version v2025.01.0

### 2025-01-01
- An older change.
`;

function run_changelog(worktree, ...args) {
    return spawnSync(process.execPath, [script, ...args], {
        cwd: worktree,
        encoding: "utf8",
    });
}

test("web changelog entries appear only when fragments are pending", async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Changelog compilation only needs one Node runtime.");

    const worktree = await mkdtemp(join(tmpdir(), "cim-changelog-"));
    try {
        await mkdir(join(worktree, "changelog.d"));
        await writeFile(join(worktree, "changelog.d", "README"), "Contributor instructions.");
        await writeFile(join(worktree, "NEWS.md"), released_news);

        let result = run_changelog(worktree, "pending");
        expect(result.status, result.stderr || result.stdout).toBe(0);
        expect(result.stdout.trim()).toBe("false");

        result = run_changelog(worktree, "build", "2099-12-31");
        expect(result.status, result.stderr || result.stdout).toBe(0);
        await expect(readFile(join(worktree, "NEWS.md"), "utf8"))
            .resolves.toBe(released_news);
        const released_build = await readFile(
            join(worktree, "_includes/news.md"), "utf8");
        expect(released_build).toBe(released_news);
        expect(released_build).not.toContain("Web-only Preview");

        await writeFile(join(worktree, "changelog.d", "first.md"), "Added the first change.");
        await writeFile(join(worktree, "changelog.d", "second.md"), "Fixed the second change.");
        result = run_changelog(worktree, "pending");
        expect(result.status, result.stderr || result.stdout).toBe(0);
        expect(result.stdout.trim()).toBe("true");

        result = run_changelog(worktree, "build", "2099-12-31");
        expect(result.status, result.stderr || result.stdout).toBe(0);

        const news = await readFile(join(worktree, "_includes/news.md"), "utf8");
        expect(news).toMatch(/^## Web-only Preview\n\n### 2099-12-31/);
        expect(news).toContain("- Added the first change.");
        expect(news).toContain("- Fixed the second change.");
        expect(news.indexOf("Web-only Preview"))
            .toBeLessThan(news.indexOf("Android Version v2025.01.0"));
        await expect(readdir(join(worktree, "changelog.d")))
            .resolves.toEqual(["README", "first.md", "second.md"]);
        await expect(readFile(join(worktree, "NEWS.md"), "utf8"))
            .resolves.toBe(released_news);

        result = run_changelog(worktree, "web", "2099-12-31");
        expect(result.status, result.stderr || result.stdout).toBe(0);
        await expect(readdir(join(worktree, "changelog.d"))).resolves.toEqual(["README"]);
    } finally {
        await rm(worktree, { recursive: true, force: true });
    }
});

test("Android releases consolidate preview entries and write F-Droid notes",
        async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Changelog compilation only needs one Node runtime.");

    const worktree = await mkdtemp(join(tmpdir(), "cim-android-changelog-"));
    try {
        await writeFile(join(worktree, "NEWS.md"), `## Web-only Preview

### 2099-12-31
- Added the newest change.

### 2099-12-01
- Fixed an earlier change.

${released_news}`);
        const result = run_changelog(worktree, "android", "2099.12.3", "123456");
        expect(result.status, result.stderr || result.stdout).toBe(0);

        const news = await readFile(join(worktree, "NEWS.md"), "utf8");
        expect(news).not.toContain("Web-only Preview");
        expect(news).toMatch(/^## Android Version v2099\.12\.3\n\n### 2099-12-31/);
        expect(news).toContain("### 2099-12-01");
        expect(news.indexOf("Android Version v2099.12.3"))
            .toBeLessThan(news.indexOf("Android Version v2025.01.0"));

        const pending = run_changelog(worktree, "pending");
        expect(pending.status, pending.stderr || pending.stdout).toBe(0);
        expect(pending.stdout.trim()).toBe("false");

        const fdroid = await readFile(join(worktree,
            "fastlane/metadata/android/en-US/changelogs/123456.txt"), "utf8");
        expect(fdroid).toBe(
            "- Added the newest change.\n- Fixed an earlier change.\n");
        expect(fdroid).not.toContain("2099-12-31");
        expect(fdroid.length).toBeLessThanOrEqual(500);
    } finally {
        await rm(worktree, { recursive: true, force: true });
    }
});
