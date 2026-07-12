import { test, expect, goto_app, play_and_wait, audio_starts } from "./fixtures/audio.js";

async function record_one_identification(page) {
    await play_and_wait(page);
    const correct_color = await page.evaluate("_CORRECT_COLOR");
    await page.locator(`#${correct_color}-flag .flag`).click();
    await expect(page.locator("#stats-total")).toHaveText("1");
}

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
});

test.describe("Session continuity", () => {
    test("a recent session survives a reload", async ({ page }) => {
        await goto_app(page);
        await record_one_identification(page);

        await page.reload();
        await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);
        await expect(page.locator("#stats-correct")).toHaveText("1");
        await expect(page.locator("#stats-total")).toHaveText("1");
    });

    test("a stale session is reset on load", async ({ page }) => {
        await goto_app(page);
        await record_one_identification(page);

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
