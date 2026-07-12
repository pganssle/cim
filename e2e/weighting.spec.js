import { test, expect, goto_app } from "./fixtures/audio.js";

// This is an integration check that the adaptive weighting is wired up:
// recorded confusion ends up boosting the confused chords when the next
// chord is picked. The properties of the algorithm itself (minima,
// normalization, thresholds, ...) are unit-test material for when
// calculate_coefficients and friends move into an importable module.
test.describe("Adaptive weighting", () => {
    test("confused chords are boosted by session history", async ({ page }) => {
        await goto_app(page);
        await page.locator("#chord-selector").selectOption("blue");

        // A completed recent session at the blue level in which blue was
        // frequently mistaken for red, while red and yellow themselves were
        // always answered correctly.
        await page.evaluate(() => {
            const now = Date.now() / 1000;
            const session = {
                current_chord: "blue",
                start_time: now - 600,
                updated_time: now - 600,
                correct: 25,
                identifications: 35,
                done: true,
                confusion_matrix: {
                    red: { red: 10 },
                    yellow: { yellow: 10 },
                    blue: { blue: 5, red: 10 },
                },
                notes: { correct: 0, identifications: 0, confusion_matrix: {} },
            };
            localStorage.setItem(
                "cim_session_history", JSON.stringify({ 100: { blue: [session] } }));
        });
        await page.reload();
        await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);

        const coefficients = await page.evaluate("get_current_coefficients()");
        expect(coefficients).toHaveLength(3);

        const [red, yellow, blue] = coefficients;
        // The chord that was gotten wrong is boosted the most, the chord it
        // was mistaken for comes next, and the never-confused chord is the
        // least likely.
        expect(blue).toBeGreaterThan(red);
        expect(red).toBeGreaterThan(yellow);
        expect(red + yellow + blue).toBeCloseTo(1.0, 6);
    });
});
