import { test, expect, goto_app, play_and_wait, audio_starts } from "./fixtures/audio.js";

// Creates and switches to a profile whose single note trainer fires after
// every guess. Going through the dialog (rather than seeding localStorage)
// also pins the profile-creation path: new_profile_from_values used to drop
// the single note settings entirely, which silently disabled the trainer
// for dialog-created profiles.
async function add_always_notes_profile(page) {
    await page.locator("#profile-infobox-trigger").click();
    await page.locator("#profile-container .pulldown-item", { hasText: "Add Profile" }).click();
    await page.locator("#profile_name_setting").fill("Notey");
    await page.locator("#npis-bolt").check();
    await page.locator("#single-note-trainer-mode-selector").selectOption("always");
    await page.locator("#single-note-trainer-correctness-mode-selector").selectOption("always");
    await page.locator("#add-user-button").click();
    await expect(page.locator("#profile-text")).toHaveText("Notey");
}

async function guess_correct_flag(page) {
    await play_and_wait(page);
    const correct_color = await page.evaluate("_CORRECT_COLOR");
    await page.locator(`#${correct_color}-flag .flag`).click();
}

async function open_single_note_trainer(page) {
    await guess_correct_flag(page);
    await expect(page.locator("#single-note-trainer")).toHaveClass(/visible/);
    // The trainer plays the note to identify automatically after 500 ms.
    await page.waitForFunction("_NOTE_AUDIO_PLAYED === true", null, { timeout: 15000 });
}

test("the single note trainer follows a guess and plays a note", async ({ page }) => {
    await goto_app(page);
    await add_always_notes_profile(page);

    await play_and_wait(page);
    const starts_before_guess = await audio_starts(page);
    const correct_color = await page.evaluate("_CORRECT_COLOR");
    await page.locator(`#${correct_color}-flag .flag`).click();

    await expect(page.locator("#single-note-trainer")).toHaveClass(/visible/);
    // Only the notes of the guessed chord are offered as choices.
    await expect(page.locator("#single-note-selector-container .note-target.visible"))
        .toHaveCount(3);
    // The note to identify actually sounds.
    await expect.poll(() => audio_starts(page), { timeout: 15000 })
        .toBeGreaterThan(starts_before_guess);

    // The next-chord button stays locked until the note round is finished.
    await expect(page.locator("#next-chord")).toHaveClass(/deactivated/);
});

test("identifying the note correctly updates the note stats", async ({ page }) => {
    await goto_app(page);
    await add_always_notes_profile(page);
    await open_single_note_trainer(page);

    const correct_note = await page.evaluate("_CORRECT_NOTE");
    await page.locator(`#single-note-selector-container [data-note="${correct_note}"]`).click();

    await expect(page.locator(`[data-note="${correct_note}"]`)).toHaveClass(/note-correct/);
    await expect(page.locator("#sn-stats-display")).toHaveClass(/visible/);
    await expect(page.locator("#note-stats-correct")).toHaveText("1");
    await expect(page.locator("#note-stats-total")).toHaveText("1");

    await expect(page.locator("#sn-note-done-button")).not.toHaveClass(/deactivated/);
    await page.locator("#sn-note-done-button").click();
    await expect(page.locator("#single-note-trainer")).not.toHaveClass(/visible/);
    await expect(page.locator("#next-chord")).not.toHaveClass(/deactivated/);
});

test("a wrong note is marked and the correct one revealed", async ({ page }) => {
    await goto_app(page);
    await add_always_notes_profile(page);
    await open_single_note_trainer(page);

    const { correct_note, wrong_note } = await page.evaluate(() => ({
        correct_note: _CORRECT_NOTE,
        wrong_note: CHORDS_TONE[_CORRECT_COLOR].find((note) => note !== _CORRECT_NOTE),
    }));
    await page.locator(`#single-note-selector-container [data-note="${wrong_note}"]`).click();

    await expect(page.locator(`[data-note="${wrong_note}"]`)).toHaveClass(/note-incorrect/);
    await expect(page.locator(`[data-note="${correct_note}"]`)).toHaveClass(/note-correct/);
    await expect(page.locator("#note-stats-correct")).toHaveText("0");
    await expect(page.locator("#note-stats-total")).toHaveText("1");
});

test("the default mode only trains white chords at black levels", async ({ page }) => {
    await goto_app(page);

    // "gray" is the first black-chord level; the default settings are
    // white_only_on_black + only_correct.
    await page.locator("#chord-selector").selectOption("gray");
    await play_and_wait(page);

    // Pin the chord to a white one so the scenario is deterministic; which
    // chord gets picked is randomized and is not what this test is about.
    await page.evaluate('_CORRECT_COLOR = "red"');
    await page.locator("#red-flag .flag").click();

    await expect(page.locator("#single-note-trainer")).toHaveClass(/visible/);
    await expect(page.locator("#next-chord")).toHaveClass(/deactivated/);
});

test("the default mode skips black chords at black levels", async ({ page }) => {
    await goto_app(page);

    await page.locator("#chord-selector").selectOption("gray");
    await play_and_wait(page);

    await page.evaluate('_CORRECT_COLOR = "gray"');
    await page.locator("#gray-flag .flag").click();

    await expect(page.locator("#stats-total")).toHaveText("1");
    await expect(page.locator("#single-note-trainer")).not.toHaveClass(/visible/);
    await expect(page.locator("#next-chord")).not.toHaveClass(/deactivated/);
});
