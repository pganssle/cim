import { test, expect, goto_app, audio_starts, max_rms } from "./fixtures/audio.js";

test("the service worker installs and precaches the app shell", async ({ page }) => {
    await goto_app(page);

    // `ready` resolves only once a worker is active, and cache.addAll()
    // rejects the whole install if any precache-listed asset 404s, so
    // getting here already verifies that the precache list is valid.
    await page.evaluate(() => navigator.serviceWorker.ready);

    const cache_names = await page.evaluate(() => caches.keys());
    expect(cache_names).toContain("cim-cache-v0");

    const cached_paths = await page.evaluate(async () => {
        const cache = await caches.open("cim-cache-v0");
        const keys = await cache.keys();
        return keys.map((request) => new URL(request.url).pathname);
    });
    expect(cached_paths).toContain("/index.html");
    expect(cached_paths).toContain("/js/cim.js");
    expect(cached_paths).toContain("/assets/css/style.css");
});

test("the app works offline after the first visit", async ({ page, context }) => {
    await goto_app(page);
    await page.evaluate(() => navigator.serviceWorker.ready);

    // A second online visit runs under the service worker's control, so
    // anything missing from the precache list (currently e.g. Tone.js) is
    // picked up by the fetch handler's runtime caching.
    await page.reload();
    await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);

    // Note: setOffline() applies to page-initiated requests; requests made
    // from inside the service worker may not be affected in all Playwright
    // versions, which would make this test pass vacuously. The cache-first
    // handler means cached assets never hit the network at all, so the
    // rendering assertions below are still meaningful.
    await context.setOffline(true);
    await page.reload();

    await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);
    await expect(page.locator("#flag-holder .flag-wrapper.visible")).toHaveCount(2);

    await page.locator("#play-button").click();
    await expect.poll(() => audio_starts(page), { timeout: 15000 })
        .toBeGreaterThanOrEqual(3);
    await expect.poll(() => max_rms(page), { timeout: 10000 })
        .toBeGreaterThan(1e-3);
});
