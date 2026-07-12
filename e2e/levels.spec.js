import { test, expect, goto_app } from "./fixtures/audio.js";

test.describe("Changing levels", () => {
    test("the chord selection survives a reload", async ({ page }) => {
        await goto_app(page);

        await page.locator("#chord-selector").selectOption("blue");
        await expect(page.locator("#flag-holder .flag-wrapper.visible")).toHaveCount(3);

        await page.reload();
        await expect(page.locator("#chord-selector")).toHaveValue("blue");
        await expect(page.locator("#flag-holder .flag-wrapper.visible")).toHaveCount(3);
    });
});
