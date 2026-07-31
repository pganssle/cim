import { test, expect, goto_app } from "./fixtures/audio.js";
import { expect_no_red_dot, expect_red_dot } from "./fixtures/visual.js";

test.describe("Profiles", () => {
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

    test("closing the settings dialog with X discards changes", async ({ page }) => {
        await goto_app(page);

        await page.locator("#profile-settings-trigger").click();
        await expect(page.locator("#profile-info-container")).toHaveClass(/visible/);
        await expect(page.locator("#target_number_setting")).toHaveValue("25");

        await page.locator("#target_number_setting").fill("42");
        await page.locator("#close-add-profile-container-button").click();
        await expect(page.locator("#profile-info-container")).not.toHaveClass(/visible/);

        await page.locator("#profile-settings-trigger").click();
        await expect(page.locator("#target_number_setting")).toHaveValue("25");
    });

    test("the guest profile cannot be renamed or deleted", async ({ page }) => {
        await goto_app(page);

        await page.locator("#profile-settings-trigger").click();
        await expect(page.locator("#profile_name_setting")).toBeDisabled();
        await expect(page.locator("#delete-profile-button")).toBeDisabled();
    });
});

test.describe("App settings", () => {
    test("What's New notifications are enabled by default and can be disabled", async ({ page }) => {
        await goto_app(page);

        const trigger_container = page.locator("#i-infobox-trigger-container");
        const trigger = page.locator("#i-infobox-trigger");
        const notification_setting = page.getByLabel("Disable What's New notifications:");
        await expect(trigger_container).toHaveClass(/has-updates/);
        await expect_red_dot(trigger);

        await page.locator("#profile-settings-trigger").click();
        await expect(notification_setting).not.toBeChecked();
        await notification_setting.check();
        await page.locator("#submit-changes-button").click();

        await expect(trigger_container).not.toHaveClass(/has-updates/);
        await expect_no_red_dot(trigger);
        await expect.poll(() => page.evaluate(() =>
            JSON.parse(localStorage.getItem("cim_state")).suppress_changelog_notifications))
            .toBe(true);

        await page.reload();
        await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);
        await expect(trigger_container).not.toHaveClass(/has-updates/);
        await expect_no_red_dot(trigger);
        await page.locator("#profile-settings-trigger").click();
        await expect(notification_setting).toBeChecked();

        await notification_setting.uncheck();
        await page.locator("#submit-changes-button").click();
        await expect(trigger_container).toHaveClass(/has-updates/);
        await expect_red_dot(trigger);
    });
});
