import { test, expect, goto_app, audio_starts, max_rms } from "./fixtures/audio.js";

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
