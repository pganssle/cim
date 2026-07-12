import { test, expect, goto_app, play_and_wait } from "./fixtures/audio.js";

async function record_one_identification(page) {
    await play_and_wait(page);
    const correct_color = await page.evaluate("_CORRECT_COLOR");
    await page.locator(`#${correct_color}-flag .flag`).click();
    await expect(page.locator("#stats-total")).toHaveText("1");
}

test("a recent session survives a reload", async ({ page }) => {
    await goto_app(page);
    await record_one_identification(page);

    await page.reload();
    await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);
    await expect(page.locator("#stats-correct")).toHaveText("1");
    await expect(page.locator("#stats-total")).toHaveText("1");
});

test("the chord selection survives a reload", async ({ page }) => {
    await goto_app(page);

    await page.locator("#chord-selector").selectOption("blue");
    await expect(page.locator("#flag-holder .flag-wrapper.visible")).toHaveCount(3);

    await page.reload();
    await expect(page.locator("#chord-selector")).toHaveValue("blue");
    await expect(page.locator("#flag-holder .flag-wrapper.visible")).toHaveCount(3);
});

test("a stale session is reset on load", async ({ page }) => {
    await goto_app(page);
    await record_one_identification(page);

    // Age the session past the 30 minute inactivity timeout.
    await page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem("cim_state"));
        const stats = state.profiles[state.current_profile].stats;
        stats.start_time -= 3600;
        stats.updated_time -= 3600;
        localStorage.setItem("cim_state", JSON.stringify(state));
    });

    await page.reload();
    await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);
    await expect(page.locator("#stats-correct")).toHaveText("0");
    await expect(page.locator("#stats-total")).toHaveText("0");
});
