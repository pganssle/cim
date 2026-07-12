import { test, expect, goto_app, play_and_wait } from "./fixtures/audio.js";

test("selecting the wrong flag records a miss and reveals the answer", async ({ page }) => {
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
