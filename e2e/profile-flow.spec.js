import { test, expect, goto_app } from "./fixtures/audio.js";

test("a profile can be added, edited, and deleted", async ({ page }) => {
    await goto_app(page);
    await expect(page.locator("#profile-text")).toHaveText("Guest");

    // Add a profile through the profile pulldown.
    await page.locator("#profile-infobox-trigger").click();
    await page.locator("#profile-container .pulldown-item", { hasText: "Add Profile" }).click();
    await page.locator("#profile_name_setting").fill("Testy");
    await page.locator("#npis-truck").check();
    await page.locator("#add-user-button").click();

    // The new profile becomes the current one and survives a reload.
    await expect(page.locator("#profile-text")).toHaveText("Testy");
    await page.reload();
    await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);
    await expect(page.locator("#profile-text")).toHaveText("Testy");

    // Change the target number through the settings dialog.
    await page.locator("#profile-settings-trigger").click();
    await expect(page.locator("#profile-info-container")).toHaveClass(/visible/);
    await page.locator("#target_number_setting").fill("30");
    await page.locator("#submit-changes-button").click();
    await expect(page.locator("#profile-info-container")).not.toHaveClass(/visible/);

    await page.locator("#profile-settings-trigger").click();
    await expect(page.locator("#target_number_setting")).toHaveValue("30");
    await page.locator("#close-add-profile-container-button").click();
    await expect(page.locator("#profile-info-container")).not.toHaveClass(/visible/);

    // Delete the profile; this falls back to the Guest profile.
    page.on("dialog", (dialog) => dialog.accept());
    await page.locator("#profile-settings-trigger").click();
    await page.locator("#delete-profile-button").click();
    await expect(page.locator("#profile-text")).toHaveText("Guest");
});
