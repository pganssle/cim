import { test, expect, goto_app } from "./fixtures/audio.js";
import { answer_rounds } from "./fixtures/flows.js";

test.describe("Changing levels", () => {
    test("the chord selection survives a reload", async ({ page }) => {
        await goto_app(page);

        await page.locator("#chord-selector").selectOption("blue");
        await expect(page.locator("#flag-holder .flag-wrapper.visible")).toHaveCount(3);

        await page.reload();
        await expect(page.locator("#chord-selector")).toHaveValue("blue");
        await expect(page.locator("#flag-holder .flag-wrapper.visible")).toHaveCount(3);
    });

    test("each level keeps its own session while switching", async ({ page }) => {
        await goto_app(page);
        await answer_rounds(page, 2, true);
        await expect(page.locator("#stats-total")).toHaveText("2");

        // Switching levels starts from a clean sheet on the new level.
        await page.locator("#chord-selector").selectOption("blue");
        await expect(page.locator("#flag-holder .flag-wrapper.visible")).toHaveCount(3);
        await expect(page.locator("#stats-total")).toHaveText("0");
        await answer_rounds(page, 1, true);
        await expect(page.locator("#stats-total")).toHaveText("1");

        // Each level's unfinished session is resumed when coming back to it.
        await page.locator("#chord-selector").selectOption("yellow");
        await expect(page.locator("#flag-holder .flag-wrapper.visible")).toHaveCount(2);
        await expect(page.locator("#stats-total")).toHaveText("2");

        await page.locator("#chord-selector").selectOption("blue");
        await expect(page.locator("#stats-total")).toHaveText("1");
    });

    test("a reset session is not resumed after switching levels", async ({ page }) => {
        await goto_app(page);
        await answer_rounds(page, 1, true);
        await page.locator("#reset-button").click();
        await expect(page.locator("#stats-total")).toHaveText("0");

        await page.locator("#chord-selector").selectOption("blue");
        await page.locator("#chord-selector").selectOption("yellow");
        await expect(page.locator("#stats-total")).toHaveText("0");
    });
});
