import { test, expect, goto_app, play_and_wait, audio_starts, max_rms, media_plays } from "./fixtures/audio.js";

test.describe("Audio playback", () => {
    test("clicking play produces real audio", async ({ page }) => {
        await goto_app(page);

        expect(await audio_starts(page)).toBe(0);
        await page.locator("#play-button").click();

        // A triad schedules one buffer source per note. The generous timeout
        // covers the initial download of the piano samples.
        await expect.poll(() => audio_starts(page), { timeout: 15000 })
            .toBeGreaterThanOrEqual(3);

        // Real signal must reach the output, not just have sources scheduled.
        await expect.poll(() => max_rms(page), { timeout: 10000 })
            .toBeGreaterThan(1e-3);

        const context_states = await page.evaluate(
            () => window.__audio_probe.contexts.map((context) => context.state));
        expect(context_states).toContain("running");
    });

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
});

test.describe("Manual trainer", () => {
    test("plays chords on demand", async ({ page }) => {
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
});
