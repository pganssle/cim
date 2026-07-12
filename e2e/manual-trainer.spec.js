import { test, expect, goto_app, play_and_wait, audio_starts, media_plays } from "./fixtures/audio.js";

test("the manual trainer plays chords on demand", async ({ page }) => {
    await goto_app(page);

    await page.locator("#trainer-infobox-trigger").click();
    await expect(page.locator("#trainer-infobox")).toHaveClass(/visible/);

    await page.locator("#trainer-infobox .flag.trainer.red").click();
    await expect.poll(() => audio_starts(page), { timeout: 15000 })
        .toBeGreaterThanOrEqual(3);
});

test("the legacy instrument plays pre-recorded chords", async ({ page }) => {
    await goto_app(page);

    // The legacy instrument plays whole-chord mp3s through <audio> elements,
    // a completely different code path from the Tone.js sampler.
    await page.locator("#instrument-selector").selectOption("piano_old");
    expect(await media_plays(page)).toBe(0);

    await play_and_wait(page);
    await expect.poll(() => media_plays(page), { timeout: 15000 })
        .toBeGreaterThanOrEqual(1);
});
