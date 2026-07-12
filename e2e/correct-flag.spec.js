import { test, expect, goto_app, play_and_wait, audio_starts } from "./fixtures/audio.js";

test("selecting the correct flag records a hit", async ({ page }) => {
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
