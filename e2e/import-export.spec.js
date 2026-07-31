import { test, expect, goto_app } from "./fixtures/audio.js";

async function unlock_import_export(page) {
    await page.locator("img.logo").click({ clickCount: 6 });
    await expect(page.locator("#download-link")).toHaveClass(/visible/);
    await expect(page.locator("#upload-link")).toHaveClass(/visible/);
}

async function upload_backup(page, backup, name = "backup.json") {
    await page.locator("#import-file-input").setInputFiles({
        name,
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(page.locator("#import-state-container")).toHaveClass(/visible/);
}

async function stored_data(page) {
    return page.evaluate(() => ({
        state: JSON.parse(localStorage.getItem("cim_state")),
        history: JSON.parse(localStorage.getItem("cim_session_history")),
    }));
}

function copied_profile(profile, { id, name, target_number, settings_updated_time }) {
    return {
        ...structuredClone(profile),
        id,
        name,
        target_number,
        settings_updated_time,
    };
}

test.describe("Import and export easter egg", () => {
    test("reveals import and export together and cancel leaves data unchanged", async ({ page }) => {
        await goto_app(page);
        await expect(page.locator("#download-link")).not.toHaveClass(/visible/);
        await expect(page.locator("#upload-link")).not.toHaveClass(/visible/);
        await unlock_import_export(page);

        const before = await stored_data(page);
        await upload_backup(page, {
            format_version: 1,
            exported_at: 100,
            state: before.state,
            history: before.history,
        });
        await page.locator("#cancel-import-button").click();

        await expect(page.locator("#import-state-container")).not.toHaveClass(/visible/);
        expect(await stored_data(page)).toEqual(before);
    });

    test("rejects invalid backup files without changing data", async ({ page }) => {
        await goto_app(page);
        await unlock_import_export(page);
        const before = await stored_data(page);
        const dialog = page.waitForEvent("dialog");

        await page.locator("#import-file-input").setInputFiles({
            name: "not-a-backup.json",
            mimeType: "application/json",
            buffer: Buffer.from('{"hello":"world"}'),
        });
        const alert = await dialog;
        expect(alert.message()).toContain("not a CIM backup");
        await alert.dismiss();

        await expect(page.locator("#import-state-container")).not.toHaveClass(/visible/);
        expect(await stored_data(page)).toEqual(before);
    });

    test("replace installs the imported state and history", async ({ page }) => {
        await goto_app(page);
        await unlock_import_export(page);
        const before = await stored_data(page);
        const imported_state = structuredClone(before.state);
        imported_state.profiles["100"].target_number = 41;
        const imported_history = {
            100: {
                yellow: [{
                    start_time: 10,
                    updated_time: 11,
                    identifications: 3,
                    current_chord: "yellow",
                    done: true,
                }],
            },
        };

        await upload_backup(page, {
            format_version: 1,
            exported_at: 200,
            state: imported_state,
            history: imported_history,
        });
        await page.locator("#replace-import-button").click();
        await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);

        const after = await stored_data(page);
        expect(after.state.profiles["100"].target_number).toBe(41);
        expect(after.history["100"].yellow.some(
            (session) => session.start_time === 10)).toBe(true);
    });

    test("merge adds users and combines session history without a settings prompt",
               async ({ page }) => {
        await goto_app(page);
        await unlock_import_export(page);
        const before = await stored_data(page);
        const imported_profile = copied_profile(before.state.profiles["100"], {
            id: 101,
            name: "Imported",
            target_number: 30,
            settings_updated_time: 200,
        });
        const imported_state = structuredClone(before.state);
        imported_state.profiles = {
            100: before.state.profiles["100"],
            101: imported_profile,
        };
        imported_state.current_profile = 101;

        await upload_backup(page, {
            format_version: 1,
            exported_at: 200,
            state: imported_state,
            history: {
                101: {
                    yellow: [{
                        start_time: 20,
                        updated_time: 21,
                        identifications: 4,
                        current_chord: "yellow",
                        done: true,
                    }],
                },
            },
        });
        await page.locator("#merge-import-button").click();
        await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);

        const after = await stored_data(page);
        expect(after.state.profiles["100"].name).toBe("Guest");
        expect(after.state.profiles["101"].name).toBe("Imported");
        expect(after.history["101"].yellow).toHaveLength(1);
    });

    test("merge resolves settings once per user and can apply an age choice to all",
               async ({ page }) => {
        await goto_app(page);
        const initial = await stored_data(page);
        const guest = initial.state.profiles["100"];
        const local_profiles = {
            100: guest,
            101: copied_profile(guest, {
                id: 101,
                name: "Alpha",
                target_number: 25,
                settings_updated_time: 100,
            }),
            102: copied_profile(guest, {
                id: 102,
                name: "Beta",
                target_number: 30,
                settings_updated_time: 100,
            }),
            103: copied_profile(guest, {
                id: 103,
                name: "Gamma",
                target_number: 35,
                settings_updated_time: 300,
            }),
        };
        await page.evaluate((profiles) => {
            const state = JSON.parse(localStorage.getItem("cim_state"));
            state.profiles = profiles;
            localStorage.setItem("cim_state", JSON.stringify(state));
        }, local_profiles);
        await page.reload();
        await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);
        await unlock_import_export(page);

        const imported_profiles = {
            101: copied_profile(local_profiles["101"], {
                id: 101,
                name: "Alpha",
                target_number: 40,
                settings_updated_time: 200,
            }),
            102: copied_profile(local_profiles["102"], {
                id: 102,
                name: "Beta",
                target_number: 50,
                settings_updated_time: 200,
            }),
            103: copied_profile(local_profiles["103"], {
                id: 103,
                name: "Gamma",
                target_number: 60,
                settings_updated_time: 200,
            }),
        };
        const imported_state = structuredClone(initial.state);
        imported_state.profiles = {
            100: initial.state.profiles["100"],
            ...imported_profiles,
        };

        await upload_backup(page, {
            format_version: 1,
            exported_at: 200,
            state: imported_state,
            history: {},
        });
        await page.locator("#merge-import-button").click();

        await expect(page.locator("#import-conflict-title")).toHaveText("Settings for Alpha");
        await page.locator("#all-from-newer-button").click();
        await page.locator("input[name='import-setting-target_number'][value='local']").check();
        await page.locator("#next-import-conflict-button").click();

        await expect(page.locator("#import-conflict-title")).toHaveText("Settings for Beta");
        await page.locator("#apply-import-choice-to-all").check();
        await page.locator("#all-from-older-button").click();
        await page.locator("#next-import-conflict-button").click();

        await expect(page.locator("#import-conflict-title")).toHaveText("Settings for Gamma");
        await expect(page.locator(
            "input[name='import-setting-target_number'][value='imported']")).toBeChecked();
        await page.locator("#next-import-conflict-button").click();
        await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);

        const after = await stored_data(page);
        expect(after.state.profiles["101"].target_number).toBe(25);
        expect(after.state.profiles["102"].target_number).toBe(30);
        expect(after.state.profiles["103"].target_number).toBe(60);
    });
});
