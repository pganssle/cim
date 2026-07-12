// Helpers for driving multi-step user flows.
import { expect } from "@playwright/test";
import { play_and_wait } from "./audio.js";

// Plays and answers `rounds` rounds in a row, each one correctly or
// incorrectly, advancing with the next button between rounds. Assumes a
// fresh round (play not yet pressed for the first one) and that the single
// note trainer is not enabled for the current profile/level.
export async function answer_rounds(page, rounds, correct) {
    for (let round = 0; round < rounds; round++) {
        if (round === 0) {
            await play_and_wait(page);
        } else {
            await page.locator("#next-chord").click();
            await page.waitForFunction("_AUDIO_PLAYED === true", null, { timeout: 15000 });
        }

        let color = await page.evaluate("_CORRECT_COLOR");
        if (!correct) {
            color = await page.evaluate(
                () => get_selected_colors().find((c) => c !== _CORRECT_COLOR));
        }
        await page.locator(`#${color}-flag .flag`).click();
    }
}

// Creates a profile through the "Add Profile" dialog and switches to it.
// Going through the dialog (rather than seeding localStorage) keeps the
// profile-creation path itself under test: new_profile_from_values used to
// silently drop or misplace dialog settings.
export async function add_profile(page, { name, icon = "npis-truck", target_number = null,
                                          single_note_mode = null,
                                          single_note_correctness_mode = null }) {
    await page.locator("#profile-infobox-trigger").click();
    await page.locator("#profile-container .pulldown-item", { hasText: "Add Profile" }).click();
    await page.locator("#profile_name_setting").fill(name);
    await page.locator(`#${icon}`).check();
    if (target_number !== null) {
        await page.locator("#target_number_setting").fill(String(target_number));
    }
    if (single_note_mode !== null) {
        await page.locator("#single-note-trainer-mode-selector").selectOption(single_note_mode);
    }
    if (single_note_correctness_mode !== null) {
        await page.locator("#single-note-trainer-correctness-mode-selector")
            .selectOption(single_note_correctness_mode);
    }
    await page.locator("#add-user-button").click();
    await expect(page.locator("#profile-text")).toHaveText(name);
}
