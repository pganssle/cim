#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import process from "node:process";

import { chromium } from "playwright";

const PORT = 4174;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const IMAGE_DIRECTORY = "fastlane/metadata/android/en-US/images";
const PHONE_DIRECTORY = `${IMAGE_DIRECTORY}/phoneScreenshots`;
const TABLET_DIRECTORY = `${IMAGE_DIRECTORY}/tenInchScreenshots`;
const PHONE_DEVICE = {
    viewport: { width: 432, height: 768 },
    deviceScaleFactor: 2.5,
    isMobile: true,
    hasTouch: true,
};
const TABLET_DEVICE = {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1.5,
    hasTouch: true,
};
const SCREENSHOT_STYLE = `
    *, *::before, *::after {
        animation: none !important;
        caret-color: transparent !important;
        transition: none !important;
    }
`;

const server = spawn(
    process.execPath,
    ["node_modules/http-server/bin/http-server", "_site", "-p", String(PORT), "--silent", "-c-1"],
    { stdio: "inherit" },
);

async function wait_for_server() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
            const response = await fetch(ORIGIN);
            if (response.ok) {
                return;
            }
        } catch {
            // The server normally needs a few attempts to start.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${ORIGIN}`);
}

async function open_app(browser, device) {
    const context = await browser.newContext({
        ...device,
        colorScheme: "dark",
        locale: "en-US",
        timezoneId: "America/New_York",
    });
    await context.addInitScript(() => {
        window.Capacitor = {};
    });

    const page = await context.newPage();
    await page.goto(ORIGIN);
    await page.locator("#play-button").waitFor({ state: "visible" });
    await page.waitForFunction(() =>
        !document.getElementById("play-button").classList.contains("deactivated"));
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: SCREENSHOT_STYLE });

    await page.evaluate(() => {
        STATE.changelog_last_read_date = get_newest_changelog_date();
        save_state();
        check_changelog_badge();
    });

    return { context, page };
}

async function select_level(page, level) {
    await page.locator("#chord-selector").selectOption(level);
    await page.waitForFunction((selected_level) =>
        document.getElementById("chord-selector").value === selected_level &&
        document.querySelectorAll("#flag-holder .flag-wrapper.visible").length ===
            Object.keys(CHORDS_TONE).indexOf(selected_level) + 1,
    level);
}

async function take_screenshot(page, path) {
    await page.screenshot({ path, fullPage: false });
}

async function capture_phone(browser) {
    const { context, page } = await open_app(browser, PHONE_DEVICE);
    try {
        await select_level(page, "blue");
        await take_screenshot(page, `${PHONE_DIRECTORY}/01-blue-trainer.png`);
    } finally {
        await context.close();
    }
}

async function capture_tablet_main(browser) {
    const { context, page } = await open_app(browser, TABLET_DEVICE);
    try {
        await select_level(page, "black");
        await take_screenshot(page, `${TABLET_DIRECTORY}/01-trainer.png`);
    } finally {
        await context.close();
    }
}

async function capture_single_note(browser) {
    const { context, page } = await open_app(browser, TABLET_DEVICE);
    try {
        await select_level(page, "blue");
        await page.evaluate(() => {
            const color = "blue";
            const notes = CHORDS_TONE[color];
            const selector = document.getElementById("single-note-selector-container");
            for (const chord_color of Object.keys(CHORDS_TONE)) {
                selector.classList.remove(chord_color);
            }
            selector.classList.add(color);
            for (const target of selector.querySelectorAll("[data-note]")) {
                target.classList.toggle("visible", notes.includes(target.dataset.note));
            }
            document.getElementById("single-note-trainer").classList.add("visible");
        });
        await take_screenshot(page, `${TABLET_DIRECTORY}/02-single-note-follow-on.png`);
    } finally {
        await context.close();
    }
}

async function capture_music_trainer(browser) {
    const { context, page } = await open_app(browser, TABLET_DEVICE);
    try {
        await page.locator("#trainer-infobox-trigger").click();
        await page.locator("#trainer-infobox.visible").waitFor();
        await take_screenshot(page, `${TABLET_DIRECTORY}/03-music-trainer.png`);
    } finally {
        await context.close();
    }
}

async function capture_statistics(browser) {
    const { context, page } = await open_app(browser, TABLET_DEVICE);
    try {
        await page.evaluate(() => {
            const last_session = Date.UTC(2026, 6, 31, 18, 0) / 1000;
            const day = 24 * 60 * 60;
            const make_session = (current_chord, index, correct) => ({
                current_chord,
                start_time: last_session - ((14 - index) * day) - 180,
                updated_time: last_session - ((14 - index) * day),
                correct,
                identifications: 30,
                done: true,
                confusion_matrix: {},
            });
            const black_results = [12, 17, 20, 23, 26, 28, 30, 30, 30, 30];
            const green_results = [25, 24, 26, 25, 24];
            const history = {
                [STATE.current_profile]: {
                    black: black_results.map((correct, index) =>
                        make_session("black", index, correct)),
                    green: green_results.map((correct, index) =>
                        make_session("green", index + black_results.length, correct)),
                },
            };
            localStorage.setItem("cim_session_history", JSON.stringify(history));
        });
        await page.reload();
        await page.waitForFunction(() =>
            !document.getElementById("play-button").classList.contains("deactivated"));
        await select_level(page, "green");
        await page.locator("#stats-history-trigger").click();
        const history = page.locator("#stats-history-container.visible");
        await history.waitFor();
        await history.evaluate((container) => {
            const dates = container.querySelectorAll(".stats-date");
            container.scrollTop = dates[3].offsetTop - dates[0].offsetTop;
        });
        await take_screenshot(page, `${TABLET_DIRECTORY}/04-statistics.png`);
    } finally {
        await context.close();
    }
}

let browser;
try {
    await wait_for_server();
    await rm(PHONE_DIRECTORY, { recursive: true, force: true });
    await rm(TABLET_DIRECTORY, { recursive: true, force: true });
    await mkdir(PHONE_DIRECTORY, { recursive: true });
    await mkdir(TABLET_DIRECTORY, { recursive: true });

    browser = await chromium.launch();
    await capture_phone(browser);
    await capture_tablet_main(browser);
    await capture_single_note(browser);
    await capture_music_trainer(browser);
    await capture_statistics(browser);
} finally {
    await browser?.close();
    server.kill("SIGTERM");
}
