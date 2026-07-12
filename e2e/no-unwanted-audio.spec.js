import { test, expect, goto_app, audio_starts, max_rms, media_plays } from "./fixtures/audio.js";

test("no audio plays before the user asks for it", async ({ page }) => {
    await goto_app(page);

    // The app eagerly creates its samplers at load; give it time to settle
    // and then assert that nothing was actually scheduled or played.
    await page.waitForTimeout(2000);

    expect(await audio_starts(page)).toBe(0);
    expect(await media_plays(page)).toBe(0);
    expect(await max_rms(page)).toBeLessThan(1e-4);
});

test("selecting a flag before playing is a no-op", async ({ page }) => {
    await goto_app(page);

    await page.locator("#yellow-flag .flag").click();

    await expect(page.locator("#stats-total")).toHaveText("0");
    await expect(page.locator("#yellow-flag .flag")).not.toHaveClass(/flag-correct/);
    await expect(page.locator("#yellow-flag .flag")).not.toHaveClass(/flag-incorrect/);
    await expect(page.locator("#next-chord")).toHaveClass(/deactivated/);
});
