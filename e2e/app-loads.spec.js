import { test, expect, goto_app } from "./fixtures/audio.js";

test("app loads with the default level's flags and empty stats", async ({ page }) => {
    await goto_app(page);

    // A fresh profile starts at the second chord ("yellow"), so exactly the
    // red and yellow flags are shown.
    const visible_flags = page.locator("#flag-holder .flag-wrapper.visible");
    await expect(visible_flags).toHaveCount(2);
    await expect(page.locator("#red-flag")).toHaveClass(/visible/);
    await expect(page.locator("#yellow-flag")).toHaveClass(/visible/);

    await expect(page.locator("#chord-selector")).toHaveValue("yellow");

    await expect(page.locator("#stats-correct")).toHaveText("0");
    await expect(page.locator("#stats-total")).toHaveText("0");
    await expect(page.locator("#stats-percent")).toHaveText("");

    // With no identifications the percentage defaults to 75, which maps to
    // the neutral cat.
    await expect(page.locator("#reaction-emoji")).toHaveText("🐱");

    // The next button only activates after a guess.
    await expect(page.locator("#next-chord")).toHaveClass(/deactivated/);
});
