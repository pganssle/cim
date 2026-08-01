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

function copied_profile(profile, {
    id,
    name,
    target_number,
    settings_updated_time,
    icon = profile.icon,
}) {
    return {
        ...structuredClone(profile),
        id,
        name,
        icon,
        target_number,
        settings_updated_time,
    };
}

function session(start_time, current_chord = "yellow") {
    return {
        start_time,
        updated_time: start_time + 60,
        identifications: 3,
        correct: 3,
        confusion_matrix: {},
        current_chord,
        done: true,
    };
}

async function set_local_profiles(page, profiles, state_updates = {}) {
    await page.evaluate(({ profiles, state_updates }) => {
        const state = JSON.parse(localStorage.getItem("cim_state"));
        Object.assign(state, state_updates);
        state.profiles = profiles;
        localStorage.setItem("cim_state", JSON.stringify(state));
    }, { profiles, state_updates });
    await page.reload();
    await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);
}

async function open_guest_import_conflict(page, {
    exported_at,
    imported_stats_updated_time,
    history = {},
    filename = "backup.json",
}) {
    await goto_app(page);
    const before = await stored_data(page);
    const local_profile = structuredClone(before.state.profiles["100"]);
    local_profile.settings_updated_time = 300;
    await set_local_profiles(page, { 100: local_profile });
    await unlock_import_export(page);

    const imported_profile = structuredClone(local_profile);
    imported_profile.target_number = 40;
    delete imported_profile.settings_updated_time;
    if (imported_stats_updated_time === undefined) {
        delete imported_profile.stats.updated_time;
    } else {
        imported_profile.stats.updated_time = imported_stats_updated_time;
    }
    const imported_state = structuredClone(before.state);
    imported_state.profiles = { 100: imported_profile };
    const backup = { state: imported_state, history };
    if (exported_at !== undefined) {
        backup.exported_at = exported_at;
    }

    await upload_backup(page, backup, filename);
    await page.locator("#merge-import-button").click();
    await expect(page.locator("#import-conflict-title")).toContainText("Guest");
}

test.describe("Import and export easter egg", () => {
    test.use({ timezoneId: "America/New_York" });

    test("reveals side-by-side import and export controls", async ({ page }) => {
        await goto_app(page);
        await expect(page.locator("#download-link")).not.toHaveClass(/visible/);
        await expect(page.locator("#upload-link")).not.toHaveClass(/visible/);
        await unlock_import_export(page);

        const [download_box, upload_box] = await Promise.all([
            page.locator("#download-link").boundingBox(),
            page.locator("#upload-link").boundingBox(),
        ]);
        expect(Math.abs(download_box.y - upload_box.y)).toBeLessThan(2);
        expect(upload_box.x).toBeGreaterThan(download_box.x + download_box.width);
    });

    test("cancel leaves data unchanged", async ({ page }) => {
        await goto_app(page);
        await unlock_import_export(page);
        const before = await stored_data(page);
        const imported_state = structuredClone(before.state);
        imported_state.profiles["100"].current_chord = "black";

        await upload_backup(page, {
            format_version: 1,
            exported_at: 100,
            state: imported_state,
            history: before.history,
        });
        await expect(page.locator("#import-single-profile")).toBeVisible();
        await page.locator("#cancel-import-button").click();

        await expect(page.locator("#import-state-container")).not.toHaveClass(/visible/);
        expect(await stored_data(page)).toEqual(before);
    });

    test("reports the profile and field for invalid backup values", async ({ page }) => {
        await goto_app(page);
        await unlock_import_export(page);
        const before = await stored_data(page);
        const invalid_state = structuredClone(before.state);
        invalid_state.profiles["100"].target_number = "lots";
        const dialog = page.waitForEvent("dialog");

        await page.locator("#import-file-input").setInputFiles({
            name: "invalid-profile.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify({ state: invalid_state, history: {} })),
        });
        const alert = await dialog;
        expect(alert.message()).toContain(
            'Profile "Guest" (ID 100): `target_number` must be a positive integer; got "lots".');
        await alert.dismiss();

        await expect(page.locator("#import-state-container")).not.toHaveClass(/visible/);
        expect(await stored_data(page)).toEqual(before);
    });

    test("migrates profiles from backups made before settings were added", async ({ page }) => {
        await goto_app(page);
        await unlock_import_export(page);
        const before = await stored_data(page);
        const legacy_profile = structuredClone(before.state.profiles["100"]);
        legacy_profile.current_chord = "black";
        for (const field of [
            "target_number",
            "current_instrument",
            "show_chord_mode",
            "reveal_chord_mode",
            "chord_display_mode",
            "single_note_mode",
            "single_note_correctness_mode",
            "persist_reaction_face",
        ]) {
            delete legacy_profile[field];
        }
        const legacy_state = {
            profiles: { 100: legacy_profile },
            current_profile: 100,
            current_chord: "black",
        };

        await upload_backup(page, {
            state: legacy_state,
            history: { 100: { black: [session(1690504698, "black")] } },
        }, "cim_state_1690723363.json");
        await expect(page.locator("#import-single-profile")).toBeVisible();
        await expect(page.locator("#incoming-profile-summary")).toContainText("2023-07-27");
        await page.locator("#replace-import-button").click();
        await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);

        const imported = (await stored_data(page)).state.profiles["100"];
        expect(imported.target_number).toBe(25);
        expect(imported.current_instrument).toBe("piano_1");
        expect(imported.single_note_mode).toBe("white_only_on_black");
        expect(imported.persist_reaction_face).toBe(false);
    });

    test("uses exported_at instead of newer timestamps within the backup",
               async ({ page }) => {
        await open_guest_import_conflict(page, {
            exported_at: 200,
            imported_stats_updated_time: 400,
        });

        await expect(page.locator(
            "input[name='import-setting-target_number'][value='local']")).toBeChecked();
    });

    test("derives the backup age from its newest data timestamp",
               async ({ page }) => {
        await open_guest_import_conflict(page, {
            imported_stats_updated_time: 200,
            history: { 100: { black: [session(400, "black")] } },
            filename: "cim_state_1.json",
        });

        await expect(page.locator(
            "input[name='import-setting-target_number'][value='imported']")).toBeChecked();
    });

    test("treats a backup without timestamps as old regardless of its filename",
               async ({ page }) => {
        await open_guest_import_conflict(page, {
            filename: "cim_state_9999999999.json",
        });

        await expect(page.locator(
            "input[name='import-setting-target_number'][value='local']")).toBeChecked();
    });

    test("single-profile preview explains and performs replacement", async ({ page }) => {
        await goto_app(page);
        await unlock_import_export(page);
        const before = await stored_data(page);
        const imported_state = structuredClone(before.state);
        imported_state.profiles["100"].target_number = 41;
        imported_state.profiles["100"].current_chord = "black";
        const imported_history = {
            100: { yellow: [session(1700000000)] },
        };

        await upload_backup(page, {
            format_version: 1,
            exported_at: 1700000200,
            state: imported_state,
            history: imported_history,
        });
        await expect(page.locator("#existing-profile-card")).toContainText("Guest");
        await expect(page.locator("#incoming-profile-card")).toContainText("1");
        await expect(page.locator("#single-profile-merge-description")).toContainText(
            "settings choice screen");
        await page.locator("#replace-import-button").click();
        await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);

        const after = await stored_data(page);
        expect(after.state.profiles["100"].target_number).toBe(41);
        expect(after.history["100"].yellow.some(
            (item) => item.start_time === 1700000000)).toBe(true);
    });

    test("multi-profile preview requires an action per user and supports bulk controls",
               async ({ page }) => {
        await goto_app(page);
        await unlock_import_export(page);
        const before = await stored_data(page);
        const imported_state = structuredClone(before.state);
        const guest = imported_state.profiles["100"];
        guest.current_chord = "black";
        imported_state.profiles["101"] = copied_profile(guest, {
            id: 101,
            name: "Imported",
            target_number: 30,
            settings_updated_time: 200,
        });
        const imported_history = {
            100: { yellow: [session(1700000000)] },
            101: { black: [session(1700100000, "black"), session(1700200000, "black")] },
        };

        await upload_backup(page, {
            format_version: 1,
            exported_at: 1700200100,
            state: imported_state,
            history: imported_history,
        });
        const rows = page.locator("#import-profile-table-body tr");
        await expect(rows).toHaveCount(2);
        await expect(rows.nth(1)).toContainText("2");
        await expect(page.locator("#continue-import-button")).toBeDisabled();

        await page.getByLabel("Merge all").check();
        await expect(page.getByLabel("Merge Guest")).toBeChecked();
        await expect(page.getByLabel("Merge Imported")).toBeChecked();
        await expect(page.locator("#continue-import-button")).toBeEnabled();
        await page.locator("#clear-import-selections-button").click();
        await expect(page.locator("#continue-import-button")).toBeDisabled();

        await page.getByLabel("Don't import Guest").check();
        await page.getByLabel("Replace Imported").check();
        await page.locator("#continue-import-button").click();
        await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);

        const after = await stored_data(page);
        expect(after.state.profiles["101"].name).toBe("Imported");
        expect(after.history["101"].black).toHaveLength(2);
        expect(after.history["100"]?.yellow?.some(
            (item) => item.start_time === 1700000000) || false).toBe(false);
    });

    test("merge shows only differing settings and handles global settings separately",
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
        await set_local_profiles(page, local_profiles, {
            suppress_changelog_notifications: true,
            changelog_last_read_date: "9999-12-31",
        });
        await unlock_import_export(page);

        const imported_profiles = {
            100: initial.state.profiles["100"],
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
                icon: "fa-taxi",
            }),
            103: copied_profile(local_profiles["103"], {
                id: 103,
                name: "Gamma",
                target_number: 60,
                settings_updated_time: 200,
            }),
        };
        const imported_state = structuredClone(initial.state);
        imported_state.profiles = imported_profiles;
        imported_state.suppress_changelog_notifications = false;
        imported_state.changelog_last_read_date = null;

        await upload_backup(page, {
            format_version: 1,
            exported_at: 200,
            state: imported_state,
            history: {},
        });
        await page.getByLabel("Merge all").check();
        await page.locator("#continue-import-button").click();

        await expect(page.locator("#import-conflict-title")).toHaveText(
            "Merge conflicts found for Alpha (1 of 4 conflicts)");
        await expect(page.locator(".import-setting-name")).toHaveText(["Target number"]);
        await expect(page.locator("#apply-import-choice-label")).toHaveText(
            "Apply choice to remaining 2 users");
        await page.locator("#all-from-newer-button").click();
        await page.locator("input[name='import-setting-target_number'][value='local']").check();
        await page.locator("#next-import-conflict-button").click();

        await expect(page.locator("#import-conflict-title")).toContainText("Beta (2 of 4");
        await expect(page.locator(".import-setting-name")).toHaveText([
            "Icon", "Target number",
        ]);
        await expect(page.locator(".import-setting-icon.fa-taxi")).toBeVisible();
        await expect(page.locator("#apply-import-choice-label")).toHaveText(
            "Apply choice to remaining 1 user");
        await page.locator("#apply-import-choice-to-all").check();
        await page.locator("#all-from-older-button").click();
        await page.locator("#next-import-conflict-button").click();

        await expect(page.locator("#import-conflict-title")).toContainText("Gamma (3 of 4");
        await expect(page.locator(
            "input[name='import-setting-target_number'][value='imported']")).toBeChecked();
        await page.locator("#next-import-conflict-button").click();

        await expect(page.locator("#import-conflict-title")).toHaveText(
            "Merge conflicts found for Global settings (4 of 4 conflicts)");
        await expect(page.locator("#import-conflict-description")).toContainText("app-wide");
        await expect(page.locator(".import-setting-name")).toHaveText([
            "Disable What's New notifications",
        ]);
        await expect(page.locator("#apply-import-choice-to-all").locator("xpath=..")).toBeHidden();
        await page.locator("#all-from-newer-button").click();
        await page.locator("#next-import-conflict-button").click();
        await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);

        const after = await stored_data(page);
        expect(after.state.profiles["101"].target_number).toBe(25);
        expect(after.state.profiles["102"].target_number).toBe(30);
        expect(after.state.profiles["102"].icon).toBe(local_profiles["102"].icon);
        expect(after.state.profiles["103"].target_number).toBe(60);
        expect(after.state.suppress_changelog_notifications).toBe(true);
        expect(after.state.changelog_last_read_date).toBe("9999-12-31");
        await expect(page.locator("#i-infobox-trigger-container")).not.toHaveClass(/has-updates/);
    });
});
