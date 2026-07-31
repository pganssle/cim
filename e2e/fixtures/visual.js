import { expect } from "@playwright/test";


async function has_red_dot(locator) {
    return locator.evaluate((element) => {
        const style = getComputedStyle(element, "::after");
        return style.content !== "none" &&
            style.display !== "none" &&
            Number.parseFloat(style.width) > 0 &&
            Number.parseFloat(style.height) > 0 &&
            style.backgroundColor === "rgb(229, 62, 62)";
    });
}

export async function expect_red_dot(locator) {
    await expect(locator).toBeVisible();
    await expect.poll(() => has_red_dot(locator)).toBe(true);
}

export async function expect_no_red_dot(locator) {
    await expect(locator).toBeVisible();
    await expect.poll(() => has_red_dot(locator)).toBe(false);
}
