#!/usr/bin/env node
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const NEWS_PATH = "NEWS.md";
const BUILD_NEWS_PATH = "_includes/news.md";
const FRAGMENTS_DIRECTORY = "changelog.d";
const CHANGELOG_DIRECTORY = "fastlane/metadata/android/en-US/changelogs";
const PREVIEW_HEADING = "## Web-only Preview";
const ANDROID_HEADING = "## Android Version v";
const FDROID_CHANGELOG_LIMIT = 500;

function normalize_markdown(markdown) {
    return `${markdown.trim()}\n`;
}

function split_preview(news) {
    const normalized = news.trim();
    if (!normalized.startsWith(PREVIEW_HEADING)) {
        return { preview: null, released: normalized };
    }

    const body = normalized.slice(PREVIEW_HEADING.length).trim();
    const released_index = body.search(/^## Android Version v/m);
    if (released_index === -1) {
        return { preview: body, released: "" };
    }
    return {
        preview: body.slice(0, released_index).trim(),
        released: body.slice(released_index).trim(),
    };
}

async function fragment_files() {
    let entries;
    try {
        entries = await readdir(FRAGMENTS_DIRECTORY);
    } catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
    return entries
        .filter((entry) => extname(entry) === ".md")
        .sort()
        .map((entry) => join(FRAGMENTS_DIRECTORY, entry));
}

async function has_pending_entries() {
    if ((await fragment_files()).length !== 0) {
        return true;
    }

    const news = await readFile(NEWS_PATH, "utf8");
    const { preview } = split_preview(news);
    return preview?.split("\n").some((line) => line.startsWith("- ")) ?? false;
}

function format_fragment(fragment, path) {
    const text = fragment.trim();
    if (!text) {
        throw new Error(`${path} is empty`);
    }
    return `- ${text.replaceAll("\n", "\n  ")}`;
}

function add_dated_section(preview, date, bullets) {
    const date_heading = `### ${date}`;
    if (!preview) {
        return `${date_heading}\n\n${bullets}`;
    }
    if (preview.startsWith(date_heading)) {
        return `${date_heading}\n\n${bullets}\n${
            preview.slice(date_heading.length).trimStart()}`.trim();
    }
    return `${date_heading}\n\n${bullets}\n\n${preview}`;
}

async function release_web(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
        throw new Error("usage: update_changelog.mjs web YYYY-MM-DD");
    }

    const paths = await fragment_files();
    if (paths.length === 0) {
        return;
    }

    const fragments = await Promise.all(paths.map((path) => readFile(path, "utf8")));
    const bullets = fragments.map((fragment, index) =>
        format_fragment(fragment, paths[index])).join("\n");
    const news = await readFile(NEWS_PATH, "utf8");
    const { preview, released } = split_preview(news);
    const dated_preview = add_dated_section(preview, date, bullets);
    const updated = `${PREVIEW_HEADING}\n\n${dated_preview}${
        released ? `\n\n${released}` : ""}`;

    await writeFile(NEWS_PATH, normalize_markdown(updated));
    await Promise.all(paths.map((path) => unlink(path)));
}

async function build_web(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
        throw new Error("usage: update_changelog.mjs build YYYY-MM-DD");
    }

    const paths = await fragment_files();
    const news = await readFile(NEWS_PATH, "utf8");
    let updated = news;
    if (paths.length !== 0) {
        const fragments = await Promise.all(
            paths.map((path) => readFile(path, "utf8")));
        const bullets = fragments.map((fragment, index) =>
            format_fragment(fragment, paths[index])).join("\n");
        const { preview, released } = split_preview(news);
        const dated_preview = add_dated_section(preview, date, bullets);
        updated = `${PREVIEW_HEADING}\n\n${dated_preview}${
            released ? `\n\n${released}` : ""}`;
    }

    await mkdir("_includes", { recursive: true });
    await writeFile(BUILD_NEWS_PATH, normalize_markdown(updated));
}

function fdroid_changelog(preview) {
    const bullets = preview.split("\n").filter((line) => line.startsWith("- "));
    if (bullets.length === 0) {
        throw new Error("Web-only Preview does not contain any changelog entries");
    }

    const included = [];
    for (const bullet of bullets) {
        const candidate = [...included, bullet].join("\n");
        if (candidate.length > FDROID_CHANGELOG_LIMIT) {
            break;
        }
        included.push(bullet);
    }
    if (included.length === 0) {
        included.push(`${bullets[0].slice(0, FDROID_CHANGELOG_LIMIT - 1)}…`);
    }
    return `${included.join("\n")}\n`;
}

async function release_android(version, version_code, allow_empty) {
    if (!/^\d{4}\.\d{2}\.\d+$/.test(version ?? "") ||
            !/^\d+$/.test(version_code ?? "")) {
        throw new Error(
            "usage: update_changelog.mjs android YYYY.MM.PATCH VERSION_CODE");
    }

    const news = await readFile(NEWS_PATH, "utf8");
    const { preview, released } = split_preview(news);
    if (!preview) {
        if (allow_empty) {
            return;
        }
        throw new Error("There are no Web-only Preview entries to release");
    }

    const version_heading = `${ANDROID_HEADING}${version}`;
    if (released.split("\n").includes(version_heading)) {
        throw new Error(`${version_heading} already exists`);
    }

    const updated = `${version_heading}\n\n${preview}${
        released ? `\n\n${released}` : ""}`;
    const changelog = fdroid_changelog(preview);
    await mkdir(CHANGELOG_DIRECTORY, { recursive: true });
    await writeFile(join(CHANGELOG_DIRECTORY, `${version_code}.txt`), changelog);
    await writeFile(NEWS_PATH, normalize_markdown(updated));
}

async function main() {
    const [command, ...args] = process.argv.slice(2);
    if (command === "pending" && args.length === 0) {
        console.log(await has_pending_entries() ? "true" : "false");
    } else if (command === "web" && args.length === 1) {
        await release_web(args[0]);
    } else if (command === "build" && args.length === 1) {
        await build_web(args[0]);
    } else if (command === "android" &&
            (args.length === 2 ||
             (args.length === 3 && args[2] === "--allow-empty"))) {
        await release_android(args[0], args[1], args[2] === "--allow-empty");
    } else {
        throw new Error(
            "usage: update_changelog.mjs {pending | build YYYY-MM-DD | web YYYY-MM-DD | android YYYY.MM.PATCH VERSION_CODE [--allow-empty]}");
    }
}

main().catch((error) => {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
});
