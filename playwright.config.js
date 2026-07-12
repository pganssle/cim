import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        baseURL: "http://127.0.0.1:4173/",
        trace: "on-first-retry",
    },
    // The site must already be built (`make html`); this only serves the
    // prebuilt _site/ directory. Keeping Jekyll out of this command means
    // the Makefile owns the build ordering.
    webServer: {
        command: "npx http-server _site -p 4173 --silent -c-1",
        url: "http://127.0.0.1:4173/index.html",
        reuseExistingServer: !process.env.CI,
    },
    projects: [
        {
            name: "chromium",
            use: {
                browserName: "chromium",
                launchOptions: {
                    // Playwright clicks carry user activation, so Tone.start()
                    // should work without this, but it removes a source of
                    // flakiness in audio tests.
                    args: ["--autoplay-policy=no-user-gesture-required"],
                },
            },
        },
    ],
});
