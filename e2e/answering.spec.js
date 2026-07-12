import { test, expect, goto_app, play_and_wait, audio_starts } from "./fixtures/audio.js";
import { answer_rounds, add_profile } from "./fixtures/flows.js";

test.describe("Answering flow", () => {
    test("a correct answer records a hit", async ({ page }) => {
        await goto_app(page);
        await play_and_wait(page);

        const correct_color = await page.evaluate("_CORRECT_COLOR");
        await page.locator(`#${correct_color}-flag .flag`).click();

        await expect(page.locator("#stats-correct")).toHaveText("1");
        await expect(page.locator("#stats-total")).toHaveText("1");
        await expect(page.locator("#stats-percent")).toHaveText("(100.0%)");
        await expect(page.locator(`#${correct_color}-flag .flag`)).toHaveClass(/flag-correct/);
        await expect(page.locator("#reaction-emoji")).toHaveText("😻");
        await expect(page.locator("#next-chord")).not.toHaveClass(/deactivated/);
    });

    test("a wrong answer records a miss and reveals the answer", async ({ page }) => {
        await goto_app(page);
        await play_and_wait(page);

        const correct_color = await page.evaluate("_CORRECT_COLOR");
        const wrong_color = correct_color === "red" ? "yellow" : "red";
        await page.locator(`#${wrong_color}-flag .flag`).click();

        await expect(page.locator("#stats-correct")).toHaveText("0");
        await expect(page.locator("#stats-total")).toHaveText("1");
        await expect(page.locator("#stats-percent")).toHaveText("(0.0%)");
        await expect(page.locator(`#${wrong_color}-flag .flag`)).toHaveClass(/flag-incorrect/);
        await expect(page.locator(`#${correct_color}-flag .flag`)).toHaveClass(/flag-correct/);

        // With the default settings ("white chords only on black chord levels")
        // the single note trainer must not appear at a white-chord level.
        await expect(page.locator("#single-note-trainer")).not.toHaveClass(/visible/);
        await expect(page.locator("#next-chord")).not.toHaveClass(/deactivated/);
    });

    test("the next button starts a new round", async ({ page }) => {
        await goto_app(page);
        await play_and_wait(page);

        const correct_color = await page.evaluate("_CORRECT_COLOR");
        await page.locator(`#${correct_color}-flag .flag`).click();
        await expect(page.locator("#next-chord")).not.toHaveClass(/deactivated/);

        const starts_before = await audio_starts(page);
        await page.locator("#next-chord").click();

        // The next round plays automatically and the button deactivates again
        // until the new chord has been answered.
        await expect(page.locator("#next-chord")).toHaveClass(/deactivated/);
        await expect.poll(() => audio_starts(page), { timeout: 15000 })
            .toBeGreaterThan(starts_before);
        await expect(page.locator(`#${correct_color}-flag .flag`)).not.toHaveClass(/flag-correct/);
    });

    test("a perfect run reaches the target", async ({ page }) => {
        await goto_app(page);
        await add_profile(page, { name: "Perfecto", target_number: 3 });

        await answer_rounds(page, 3, true);

        await expect(page.locator("#stats-correct")).toHaveText("3");
        await expect(page.locator("#stats-total")).toHaveText("3");
        await expect(page.locator("#stats-percent")).toHaveText("(100.0%)");
        // Reaching the target number marks the session done; a clean sheet
        // additionally marks it perfect.
        await expect(page.locator("#stats-container")).toHaveClass(/done/);
        await expect(page.locator("#stats-container")).toHaveClass(/perfect/);
    });

    test("a run of wrong answers is reflected in the stats", async ({ page }) => {
        await goto_app(page);

        await answer_rounds(page, 3, false);

        await expect(page.locator("#stats-correct")).toHaveText("0");
        await expect(page.locator("#stats-total")).toHaveText("3");
        await expect(page.locator("#stats-percent")).toHaveText("(0.0%)");
        await expect(page.locator("#stats-container")).not.toHaveClass(/perfect/);
        await expect(page.locator("#stats-container")).not.toHaveClass(/done/);
    });

    test("the reset button starts a fresh session", async ({ page }) => {
        await goto_app(page);
        await answer_rounds(page, 1, true);
        await expect(page.locator("#stats-total")).toHaveText("1");

        await page.locator("#reset-button").click();

        await expect(page.locator("#stats-correct")).toHaveText("0");
        await expect(page.locator("#stats-total")).toHaveText("0");
        await expect(page.locator("#stats-percent")).toHaveText("");
        await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);
    });
});

test.describe("Session continuity", () => {
    test("a recent session survives a reload", async ({ page }) => {
        await goto_app(page);
        await answer_rounds(page, 1, true);
        await expect(page.locator("#stats-total")).toHaveText("1");

        await page.reload();
        await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);
        await expect(page.locator("#stats-correct")).toHaveText("1");
        await expect(page.locator("#stats-total")).toHaveText("1");
    });

    test("a stale session is reset on load", async ({ page }) => {
        await goto_app(page);
        await answer_rounds(page, 1, true);
        await expect(page.locator("#stats-total")).toHaveText("1");

        // Age the session past the 30 minute inactivity timeout.
        await page.evaluate(() => {
            const state = JSON.parse(localStorage.getItem("cim_state"));
            const stats = state.profiles[state.current_profile].stats;
            stats.start_time -= 3600;
            stats.updated_time -= 3600;
            localStorage.setItem("cim_state", JSON.stringify(state));
        });

        await page.reload();
        await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);
        await expect(page.locator("#stats-correct")).toHaveText("0");
        await expect(page.locator("#stats-total")).toHaveText("0");
    });
});
