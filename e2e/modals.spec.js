import { test, expect, goto_app } from "./fixtures/audio.js";
import { answer_rounds } from "./fixtures/flows.js";

// Clicks just outside the left edge of the given element, at its vertical
// middle. How much of the page the modal covers varies between browser
// engines, so the point is computed from its actual geometry.
async function click_outside(page, locator) {
    const box = await locator.boundingBox();
    await page.mouse.click(Math.max(box.x - 10, 1), box.y + box.height / 2);
}

test.describe("Informational modal", () => {
    test("opens from its trigger and describes the method", async ({ page }) => {
        await goto_app(page);

        await page.locator("#i-infobox-trigger").click();
        await expect(page.locator("#i-infobox")).toHaveClass(/visible/);
        await expect(page.locator("#i-infobox")).toContainText("Eguchi");
    });

    test("clicking elsewhere closes it", async ({ page }) => {
        await goto_app(page);

        await page.locator("#i-infobox-trigger").click();
        await expect(page.locator("#i-infobox")).toHaveClass(/visible/);

        await click_outside(page, page.locator("#i-infobox"));
        await expect(page.locator("#i-infobox")).not.toHaveClass(/visible/);
    });

    test("opening another modal closes it", async ({ page }) => {
        await goto_app(page);

        await page.locator("#i-infobox-trigger").click();
        await expect(page.locator("#i-infobox")).toHaveClass(/visible/);

        // The open infobox overlays the menu triggers, so a real pointer
        // cannot reach them while it is open (arguably a UI quirk). Dispatch
        // the click directly to exercise the one-modal-at-a-time logic.
        await page.locator("#trainer-infobox-trigger").dispatchEvent("click");
        await expect(page.locator("#trainer-infobox")).toHaveClass(/visible/);
        await expect(page.locator("#i-infobox")).not.toHaveClass(/visible/);
    });
});

test.describe("Stats history", () => {
    test("starts out empty", async ({ page }) => {
        await goto_app(page);

        await page.locator("#stats-history-trigger").click();
        await expect(page.locator("#stats-history-container")).toHaveClass(/visible/);
        await expect(page.locator(".stats-history-item")).toHaveCount(0);
    });

    test("shows a finished session", async ({ page }) => {
        await goto_app(page);
        await answer_rounds(page, 1, true);
        await page.locator("#reset-button").click();

        await page.locator("#stats-history-trigger").click();
        await expect(page.locator("#stats-history-container")).toHaveClass(/visible/);

        const item = page.locator(".stats-history-item");
        await expect(item).toHaveCount(1);
        await expect(item.locator(".stats-color")).toHaveClass(/yellow/);
        await expect(item.locator(".session-stats")).toContainText("1 / 1 (100.0%)");
        await expect(item.locator(".stats-date")).toHaveText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
        // 100% maps to the highest neutral reaction level.
        await expect(item.locator(".session-emoji")).toHaveText("😸");
    });
});
