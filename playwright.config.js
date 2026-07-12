import { defineConfig } from "@playwright/test";

// Port for the static server that serves the built site during tests;
// override with e.g. `CIM_TEST_PORT=8123 npm run test:e2e` if the default
// collides with something else on your machine.
const PORT = process.env.CIM_TEST_PORT || 4173;

export default defineConfig({
    testDir: "e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        baseURL: `http://127.0.0.1:${PORT}/`,
        trace: "on-first-retry",
    },
    // The site must already be built (`make html`); this only serves the
    // prebuilt _site/ directory. Keeping Jekyll out of this command means
    // the Makefile owns the build ordering.
    webServer: {
        command: `npx http-server _site -p ${PORT} --silent -c-1`,
        url: `http://127.0.0.1:${PORT}/index.html`,
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
        {
            name: "firefox",
            use: {
                browserName: "firefox",
                launchOptions: {
                    firefoxUserPrefs: {
                        // Same autoplay insurance as the Chromium flag.
                        "media.autoplay.default": 0,
                        "media.autoplay.blocking_policy": 0,
                    },
                },
            },
        },
    ],
});
