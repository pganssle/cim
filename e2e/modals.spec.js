import { test, expect, goto_app } from "./fixtures/audio.js";
import { answer_rounds, add_profile } from "./fixtures/flows.js";

// Clicks just outside the left edge of the given element, at its vertical
// middle. How much of the page the modal covers varies between browser
// engines, so the point is computed from its actual geometry.
async function click_outside(page, locator) {
    const box = await locator.boundingBox();
    await page.mouse.click(Math.max(box.x - 10, 1), box.y + box.height / 2);
}

test.describe("Informational modal", () => {
    test("opens from its trigger and describes the method", async ({ page }) => {
        await goto_app(page);

        await page.locator("#i-infobox-trigger").click();
        await expect(page.locator("#i-infobox")).toHaveClass(/visible/);
        await expect(page.locator("#i-infobox")).toContainText("Eguchi");
    });

    test("clicking elsewhere closes it", async ({ page }) => {
        await goto_app(page);

        await page.locator("#i-infobox-trigger").click();
        await expect(page.locator("#i-infobox")).toHaveClass(/visible/);

        await click_outside(page, page.locator("#i-infobox"));
        await expect(page.locator("#i-infobox")).not.toHaveClass(/visible/);
    });

    test("opening another modal closes it", async ({ page }) => {
        await goto_app(page);

        await page.locator("#i-infobox-trigger").click();
        await expect(page.locator("#i-infobox")).toHaveClass(/visible/);

        // The open infobox overlays the menu triggers, so a real pointer
        // cannot reach them while it is open (arguably a UI quirk). Dispatch
        // the click directly to exercise the one-modal-at-a-time logic.
        await page.locator("#trainer-infobox-trigger").dispatchEvent("click");
        await expect(page.locator("#trainer-infobox")).toHaveClass(/visible/);
        await expect(page.locator("#i-infobox")).not.toHaveClass(/visible/);
    });
});

test.describe("Stats history", () => {
    test("starts out empty", async ({ page }) => {
        await goto_app(page);

        await page.locator("#stats-history-trigger").click();
        await expect(page.locator("#stats-history-container")).toHaveClass(/visible/);
        await expect(page.locator(".stats-history-item")).toHaveCount(0);
    });

    test("shows a finished session", async ({ page }) => {
        await goto_app(page);
        await answer_rounds(page, 1, true);
        await page.locator("#reset-button").click();

        await page.locator("#stats-history-trigger").click();
        await expect(page.locator("#stats-history-container")).toHaveClass(/visible/);

        const item = page.locator(".stats-history-item");
        await expect(item).toHaveCount(1);
        await expect(item.locator(".stats-color")).toHaveClass(/yellow/);
        await expect(item.locator(".session-stats")).toContainText("1 / 1 (100.0%)");
        await expect(item.locator(".stats-date")).toHaveText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
        // 100% maps to the highest neutral reaction level.
        await expect(item.locator(".session-emoji")).toHaveText("😸");
    });

    test("shows note results when a session had the follow-on", async ({ page }) => {
        await goto_app(page);
        await add_profile(page, {
            name: "Notey",
            single_note_mode: "always",
            single_note_correctness_mode: "always",
        });

        // One correct chord answer followed by a correct note answer.
        await answer_rounds(page, 1, true);
        await expect(page.locator("#single-note-trainer")).toHaveClass(/visible/);
        await page.waitForFunction("_NOTE_AUDIO_PLAYED === true", null, { timeout: 15000 });
        const correct_note = await page.evaluate("_CORRECT_NOTE");
        await page.locator(`#single-note-selector-container [data-note="${correct_note}"]`).click();
        await page.locator("#sn-note-done-button").click();
        await page.locator("#reset-button").click();

        await page.locator("#stats-history-trigger").click();

        const item = page.locator(".stats-history-item");
        await expect(item).toHaveCount(1);
        await expect(item.locator(".session-stats")).toContainText("1 / 1 (100.0%)");
        await expect(item.locator(".sn-session-stats")).toContainText("♪ 1 / 1 (100.0%)");
    });

    test("shows a mix of levels, follow-ons, and reactions", async ({ page }) => {
        await goto_app(page);

        // Three finished sessions on different levels: a perfect yellow one
        // in the old format (no note stats at all), a failed blue one with a
        // note follow-on, and a middling green one whose follow-on never ran.
        await page.evaluate(() => {
            const now = Date.now() / 1000;
            function make_session(chord, age, correct, identifications, notes) {
                const session = {
                    current_chord: chord,
                    start_time: now - age - 60,
                    updated_time: now - age,
                    correct: correct,
                    identifications: identifications,
                    done: true,
                    confusion_matrix: {},
                };
                if (notes !== undefined) {
                    session.notes = notes;
                }
                return session;
            }
            const history = {
                100: {
                    yellow: [make_session("yellow", 200, 10, 10)],
                    blue: [make_session("blue", 100, 0, 10,
                        { correct: 5, identifications: 10, confusion_matrix: {} })],
                    green: [make_session("green", 300, 7, 10,
                        { correct: 0, identifications: 0, confusion_matrix: {} })],
                },
            };
            localStorage.setItem("cim_session_history", JSON.stringify(history));
        });
        await page.reload();
        await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);

        await page.locator("#stats-history-trigger").click();
        const items = page.locator(".stats-history-item");
        await expect(items).toHaveCount(3);

        // Sessions are sorted most recent first: blue, yellow, green.
        await expect(items.nth(0).locator(".stats-color")).toHaveClass(/blue/);
        await expect(items.nth(1).locator(".stats-color")).toHaveClass(/yellow/);
        await expect(items.nth(2).locator(".stats-color")).toHaveClass(/green/);

        // Only the blue session ran the follow-on, so only it gets a note
        // stats line; the green session's zero-identification note tally is
        // not shown.
        await expect(page.locator(".sn-session-stats")).toHaveCount(1);
        await expect(items.nth(0).locator(".session-stats")).toContainText("0 / 10 (0.0%)");
        await expect(items.nth(0).locator(".sn-session-stats")).toContainText("♪ 5 / 10 (50.0%)");

        // Each session's percentage maps to its own reaction emoji.
        await expect(items.nth(0).locator(".session-emoji")).toHaveText("😿");
        await expect(items.nth(1).locator(".session-emoji")).toHaveText("😸");
        await expect(items.nth(2).locator(".session-emoji")).toHaveText("🐱");
    });
});
