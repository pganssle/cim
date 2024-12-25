let TONE_SAMPLERS = {};

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("../sw.js").then(
        (registration) => {
            console.log("Service worker successfully registered.");
        },
        (error) => {
            console.error(`Service worker registration failed: ${error}`);
        }
    );

}

function start_tone() {
    if (!_TONE_STARTED) {
        Tone.start();
        Tone.loaded().then(() => _TONE_STARTED = true);
    }
}

function get_sampler(instrument) {
    if (TONE_SAMPLERS[instrument] === undefined) {
        const instrument_info = INSTRUMENT_INFO[instrument];
        if (instrument_info.legacy) {
            TONE_SAMPLERS[instrument] = get_sampler(instrument_info.fallback);
        } else {
            const sampler = new Tone.Sampler({
                urls: instrument_info.sample_files,
                release: 1,
                baseUrl: instrument_info.base_url,
            }).toDestination();
            TONE_SAMPLERS[instrument] = sampler;
            Tone.loaded().then(() => sampler.volume.value = 0);
        }
    }

    start_tone();
    return TONE_SAMPLERS[instrument];
}

function get_current_sampler() {
    return get_sampler(STATE.current_instrument);
}

function get_current_timestamp() {
    return Date.now() / 1000;
}

function _pad_number(value, padding) {
    return String(value).padStart(padding, '0');
}

function format_date(d) {
    return d.getFullYear() + "-" +
        _pad_number(d.getMonth() + 1, 2) + "-" +
        _pad_number(d.getDate(), 2);
}

function format_datetime(dt, offset = false) {
    let out = format_date(dt) + " " + _pad_number(dt.getHours(), 2) + ":" +
        _pad_number(dt.getMinutes(), 2);
    if (offset) {
        let tz_offset = dt.getTimezoneOffset(); // In minutes
        let sign = (tz_offset < 0) ? "-" : "+";
        tz_offset = Math.abs(tz_offset);
        let tz_hours = _pad_number(Math.floor(tz_offset / 60), 2);
        let tz_minutes = _pad_number(tz_offset % 60, 2);

        out += sign + tz_hours + ":" + tz_minutes;
    }

    return out;
}

function is_recent(timestamp) {
    return (get_current_timestamp() - timestamp) <= SESSION_TIMEOUT_TIME_SECONDS;
}

function new_tally() {
    return {
        correct: 0,
        identifications: 0,
        confusion_matrix: {},
    }
}

function new_stats() {
    return {
        current_chord: STATE !== null ? STATE.current_chord : _DEFAULT_CHORD,
        start_time: get_current_timestamp(),
        updated_time: get_current_timestamp(),
        correct: 0,
        identifications: 0,
        confusion_matrix: {},
        notes: new_tally(),
        done: false,
    }
}

let _COLORS = null;
let _CHORDS_ON = false;
let _CORRECT_COLOR = null;
let _CORRECT_NOTE = null;
let _CURRENT_COEFFICIENTS = null;
let _SELECTED_ELEM = null;
let _CORRECT_ELEM = null;
let _CORRECT_NOTE_ELEM = null;
let _SELECTED_NOTE_ELEM = null;
let _CURRENT_AUDIO = null;
let _CURRENT_NOTE_AUDIO = null;
let _CURRENT_INFOBOX = null;
let _PROFILE_CONTAINER = null;
let _INFOBOX_TRIGGERS = [];
let _AUDIO_PLAYED = false;
let _NOTE_AUDIO_PLAYED = false;
let _EMOJI_LOCK = false;
let _TRAINER_PRELOADED = false;
let _TONE_STARTED = false;
let _SESSION_HISTORY = null;
let _DOWNLOAD_ENABLED_CLICKS = 0;
let _DOWNLOAD_ENABLED_LAST_CLICK = null;
let _EASTER_EGG_CLICKS = 0;
let _EASTER_EGG_LAST_CLICK = null;
let _EASTER_EGG_ENABLED = false;

const _DEFAULT_CHORD = Object.keys(CHORDS_TONE)[1];
const _DEFAULT_INSTRUMENT = Object.keys(INSTRUMENT_INFO)[0];
const _DEFAULT_TARGET_NUMBER = 25;
const _DEFAULT_SHOW_CHORD_MODE = "black_only";
const _DEFAULT_REVEAL_CHORD_MODE = "always";
const _DEFAULT_CHORD_DISPLAY_MODE = "shapes_and_letters";
const _DEFAULT_SINGLE_NOTE_MODE = "white_only_on_black";
const _DEFAULT_SINGLE_NOTE_CORRECTNESS_MODE = "only_correct";

const _INFOBOX_TRIGGER_IDS = [
    "trainer-infobox-trigger",
    "i-infobox-trigger",
    "profile-infobox-trigger",
    "profile-settings-trigger",
    "stats-history-trigger",
];

let AUDIO_FILES = null;

const STATE_KEY = "cim_state";
const SESSION_HISTORY_KEY = "cim_session_history";
const _LEGACY_USER_ID = 0;
const _GUEST_USER_ID = 100;

// After 30 minutes of inactivity call it a new session
const SESSION_TIMEOUT_TIME_SECONDS = 60 * 30;

let STATE = null;

function get_color_index(color) {
    return Object.keys(CHORDS_TONE).findIndex((x) => x === color);
}

function use_legacy(color) {
    if (INSTRUMENT_INFO[STATE.current_instrument].legacy) {
        if (color === undefined) {
            return true;
        }

        if (get_audio_files().mp3.has(color)) {
            return true;
        }
    }
    return false;
}

function get_selected_colors() {
    const chord_idx = get_color_index(STATE.current_chord);
    if (_COLORS === null) {
        _COLORS = Object.keys(CHORDS_TONE).slice(0, chord_idx + 1);
    }

    return _COLORS;
}

// TODO: Filter out non-audio files.

function get_audio_files() {
    if (AUDIO_FILES === null) {
        AUDIO_FILES = {
            "mp3": new Map(),
            "opus": new Map(),
        };

        function af_obj(filename) {
            [base, ext] = filename.split(".");
            [chord, color, _] = filename.split("_");

            return {
                filename: filename,
                color: color,
                chord: chord,
                ext: ext,
                elem: null,
            };
        }

        for (const file of UNSORTED_AUDIO_FILES) {
            let audio_file_obj = af_obj(file);
            let out_map = AUDIO_FILES[audio_file_obj["ext"]];
            if (!out_map.has(audio_file_obj.color)) {
                out_map.set(audio_file_obj.color, []);
            }

            out_map.get(audio_file_obj.color).push(audio_file_obj);
        }
    }

    return AUDIO_FILES;
}

function populate_flags() {
    const colors = get_selected_colors();
    const base_elem = document.getElementById("flag-holder");

    for (let wrapper_elem of base_elem.querySelectorAll(".flag-wrapper")) {
        if (colors.includes(wrapper_elem.dataset.color)) {
            wrapper_elem.classList.add("visible");
        } else {
            wrapper_elem.classList.remove("visible");
        }
    }

    if (colors.length > 9) {
        base_elem.classList.add("many");
    } else {
        base_elem.classList.remove("many");
    }

    if (colors.length < 4) {
        base_elem.classList.add("few");
    } else {
        base_elem.classList.remove("few");
    }

    if (_CHORDS_ON && get_current_profile().reveal_chord_mode === "always") {
        base_elem.classList.add("chord-notes");
    } else {
        base_elem.classList.remove("chord-notes");
    }

}

function audio_file_elem(audio_file) {
    if (audio_file.elem === null) {
        audio_file.elem = document.createElement("audio");
        audio_file.elem.classList.add("chord");
        audio_file.elem.controls = true;
        audio_file.elem.src = "static_files/chords/" + audio_file.filename;
        audio_file.elem.onended = () => {
            _AUDIO_PLAYED = true;
        };
    }

    return audio_file.elem;
}

function normal_random(mean=0, stdev=1) {
    const u = 1 - Math.random(); // Converting [0,1) to (0,1]
    const v = Math.random();
    const z = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
    // Transform to the desired mean and standard deviation:
    return z * stdev + mean;
}

function clip(n, low, high) {
    return Math.min(Math.max(n, low), high);
}


function sum(arr) {
    return arr.reduce((a, b) => a + b, 0);
}

function cumulative_sum(arr) {
    let out = new Array();
    let acc = 0;
    for (const value of arr) {
        acc += value;
        out.push(acc);
    }

    return out;
}

function random_elem(arr, weights) {
    if (weights === undefined) {
        return arr[Math.floor(Math.random() * arr.length)];
    } else {
        const cum_weights = cumulative_sum(weights);
        const number = Math.random();
        for (const [index, value] of arr.entries()) {
            if (number <= cum_weights[index]) {
                return value;
            }
        }
    }
}

function random_duration(mean=2, stdev=0.3, min=1.0, max=2.5) {
    return clip(normal_random(mean, stdev), min, max);
}


function select_new_color() {
    weights = get_current_coefficients();
    _CORRECT_COLOR = random_elem(get_selected_colors(), weights);
    if (_SELECTED_ELEM !== null) {
        _SELECTED_ELEM.classList.remove("flag-correct");
        _SELECTED_ELEM.classList.remove("flag-incorrect");
        _SELECTED_ELEM = null;
    }

    if (_CORRECT_ELEM !== null) {
        _CORRECT_ELEM.classList.remove("flag-correct");
        _CORRECT_ELEM.classList.remove("flag-incorrect");
        _CORRECT_ELEM = null;
    }
}

function update_start_time_if_needed() {
    let stats = get_current_profile().stats;
    if (stats.identifications == 0) {
        stats.start_time = get_current_timestamp();
    }
}

function update_stats(correct_color, chosen_color) {
    const correct = correct_color === chosen_color;
    let stats = get_current_profile().stats;
    stats.identifications++;
    if (correct) {
        stats.correct++;
    }

    if (stats.confusion_matrix[correct_color] === undefined) {
        stats.confusion_matrix[correct_color] = {};
    }

    let row = stats.confusion_matrix[correct_color];
    if (row[chosen_color] === undefined) {
        row[chosen_color] = 0;
    }

    row[chosen_color] = row[chosen_color] + 1;

    stats.updated_time = get_current_timestamp();
    save_state();
}

function update_note_stats(color, correct_note, chosen_note) {
    const correct = correct_note === chosen_note;
    let stats = get_current_profile().stats;
    if (stats.notes === undefined) {
        stats.notes = new_tally();
    }

    stats.notes.identifications++;
    if (correct) {
        stats.notes.correct++;
    }

    let cm = stats.notes.confusion_matrix;
    if (cm[color] === undefined) {
        cm[color] = {};
    }

    let color_matrix = cm[color];
    if (color_matrix[correct_note] === undefined) {
        color_matrix[correct_note] = {};
    }

    let row = color_matrix[correct_note];
    if (row[chosen_note] === undefined) {
        row[chosen_note] = 0;
    }

    row[chosen_note] = row[chosen_note] + 1;

    stats.updated_time = get_current_timestamp();
    save_state();
}


function get_cat_emoji(level) {
    const emoji_levels = {
        0: '😿',
        1: '😾',
        2: '🐱',
        3: '😺',
        4: '😸',
        5: '🙀',
        6: '😻',
    };

    return emoji_levels[level];
}

function set_cat_emoji(level) {
    const emoji = get_cat_emoji(level);

    document.getElementById("reaction-emoji").innerHTML = emoji;
}


function calculate_neutral_level(percentage) {
    const level = Math.min(Math.max(0, Math.floor((percentage - 50) / 10)), 4);
    return level;
}

function calculate_percentage(correct, identifications) {
    if ((correct === undefined) != (identifications === undefined)) {
        throw "Must specify both correct and identifications or neither.";
    }
    if (correct === undefined) {
        let stats = get_current_profile().stats;

        correct = stats.correct;
        identifications = stats.identifications;
    }

    if (identifications == 0) {
        return 75;
    }

    return 100 * (correct / identifications);
}


function update_stats_display() {
    let container_elem = document.getElementById("stats-container");

    const stats = get_current_profile().stats;
    normalize_stats_object(stats);

    // Update chord stats
    const correct = stats.correct;
    const identifications = stats.identifications;
    const stats_display_elem = document.getElementById("chord-stats-display");

    update_stats_container(stats_display_elem, correct, identifications);

    if (identifications >= get_current_target_number()) {
        container_elem.classList.add("done");
    } else {
        container_elem.classList.remove("done");
    }

    if (correct == identifications) {
        container_elem.classList.add("perfect");
    } else {
        container_elem.classList.remove("perfect");
    }

    // Update single note stats
    const notes_correct = stats.notes.correct;
    const note_identifications = stats.notes.identifications;

    const note_stats_elem = document.getElementById("sn-stats-display");
    update_stats_container(note_stats_elem, notes_correct, note_identifications);
    if (note_identifications) {
        note_stats_elem.classList.add("visible");
    } else {
        note_stats_elem.classList.remove("visible");
    }

    if (!_EMOJI_LOCK) {
        reset_cat_emoji();
    }
}

function update_stats_container(container_elem, correct, identifications) {
    let correct_elem = container_elem.querySelector(".stats-correct");
    let total_elem = container_elem.querySelector(".stats-total");
    let perc_elem = container_elem.querySelector(".stats-percent");

    correct_elem.innerHTML = correct;
    total_elem.innerHTML = identifications;
    let percentage = calculate_percentage(correct, identifications);

    if (identifications > 0) {
        perc_elem.innerHTML = "(" + percentage.toFixed(1) + "%)";
    } else {
        perc_elem.innerHTML = "";
    }
}

function normalize_stats_object(stats) {
    // If we have old stats objects that don't have the `.notes` attribute, we
    // can add an empty one.
    if (stats.notes === undefined) {
        stats.notes = new_tally();
    }
}

function reset_cat_emoji() {
    set_cat_emoji(calculate_neutral_level(calculate_percentage()));
}

function select_flag(elem) {
    if (_SELECTED_ELEM !== null) {
        return;
    }
    if (_AUDIO_PLAYED === false) {
        return;
    }
    const chosen_color = elem.parentElement.dataset.color;
    const flag_holder = document.getElementById("flag-holder");

    _EMOJI_LOCK = true;
    update_start_time_if_needed();
    update_stats(_CORRECT_COLOR, chosen_color);
    update_stats_display();

    const is_correct = (chosen_color === _CORRECT_COLOR);
    if (is_correct) {
        elem.classList.add("flag-correct");
        set_cat_emoji(6);
    } else {
        elem.classList.add("flag-incorrect");
        _CORRECT_ELEM = flag_holder.querySelector("div[data-color=" + _CORRECT_COLOR + "]>div.flag");
        _CORRECT_ELEM.classList.add("flag-correct");
        set_cat_emoji(5)
    }
    _SELECTED_ELEM = elem;

    setTimeout(function() {
        _EMOJI_LOCK = false;
        reset_cat_emoji();
    }, 1500);

    if (_CHORDS_ON && get_current_profile().reveal_chord_mode === "after_guess") {
        document.getElementById("flag-holder").classList.add("chord-notes");
    }

    if (should_load_single_note_trainer(is_correct)) {
        populate_single_note_trainer();
    } else {
        let next_button = document.getElementById("next-chord");
        next_button.classList.remove("deactivated");
    }
}

function select_single_note(elem) {
    if (_SELECTED_NOTE_ELEM !== null) {
        return; // A note has already been selected
    }
    if (!_NOTE_AUDIO_PLAYED) {
        return; // Note audio hasn't been played yet
    }

    const selectedNote = elem.dataset.note;
    update_note_stats(_CORRECT_COLOR, _CORRECT_NOTE, selectedNote);
    update_stats_display();

    // Check if the selected note is correct
    is_correct = (selectedNote === _CORRECT_NOTE);
    if (is_correct) {
        elem.classList.add("note-correct");
    } else {
        elem.classList.add("note-incorrect");
        if (_CORRECT_NOTE_ELEM) {
            _CORRECT_NOTE_ELEM.classList.add("note-correct");
        }
    }

    _SELECTED_NOTE_ELEM = elem;

    let nextButton = document.getElementById("sn-note-next-button");
    if (nextButton) {
        nextButton.classList.remove("deactivated");
    }

    let doneButton = document.getElementById("sn-note-done-button");
    if (doneButton) {
        doneButton.classList.remove("deactivated");
    }
}

function single_note_done(next) {
    document.getElementById("single-note-trainer").classList.remove("visible");
    document.getElementById("single-note-selector-container").classList.remove(_CORRECT_COLOR);
    let next_button = document.getElementById("next-chord");
    next_button.classList.remove("deactivated");
    let sn_next_button = document.getElementById("sn-note-next-button");
    sn_next_button.classList.add("deactivated");
    let sn_done_button = document.getElementById("sn-note-done-button");
    sn_done_button.classList.add("deactivated");

    _CORRECT_NOTE_ELEM.classList.remove("note-correct");
    _SELECTED_NOTE_ELEM.classList.remove("note-incorrect");
    if (next) {
        next_audio();
    }
}

function set_played_after(delay) {
    setTimeout(() => {
        _AUDIO_PLAYED = true;
    },
    delay
    );
}

function set_note_played_after(delay) {
    setTimeout(() => {
        _NOTE_AUDIO_PLAYED = true;
    },
    delay
    );
}

// Standard Normal variate using Box-Muller transform.
function play_chord_tone(chord_or_notes, duration) {
    let chord;
    if (CHORDS_TONE.hasOwnProperty(chord_or_notes)) {
        chord = CHORDS_TONE[chord_or_notes];
    } else {
        chord = chord_or_notes;
    }

    if (duration === null) {
        duration = random_duration();
    }
    Tone.loaded().then(() => {
        get_sampler(STATE.current_instrument).triggerAttackRelease(chord, duration);
    });
}

function play_audio() {
    if (document.getElementById("play-button").classList.contains("deactivated")) {
        return;
    }

    let [chord, duration] = _CURRENT_AUDIO;

    if (isNaN(duration)) {
        // If the duration is not known, default to a relatively low value.
        duration = 0.8;
    }
    set_played_after(duration * 0.8);
    play_chord(chord, duration);
}

function play_single_note_audio() {
    let [note, duration] = _CURRENT_NOTE_AUDIO;

    set_note_played_after(duration * 0.8);
    play_chord_tone([note], duration);
}

function play_chord_files(color) {
    const audio_files = get_audio_files();
    const audio_file = random_elem(audio_files["mp3"].get(color));
    audio_file_elem(audio_file).play();
}

function play_chord(color, duration=null) {
    if (color.play !== undefined) {
        color.play();
    } else if (use_legacy(color)) {
        play_chord_files(color);
    } else {
        play_chord_tone(color, duration);
    }
}

function next_audio() {
    let next_button = document.getElementById("next-chord");
    if (next_button.classList.contains("deactivated")) {
        return;
    }
    if (_CHORDS_ON && get_current_profile().reveal_chord_mode === "after_guess") {
        document.getElementById("flag-holder").classList.remove("chord-notes");
    }
    populate_audio();
    play_audio();

    next_button.classList.add("deactivated");
}

function populate_single_note_trainer() {
    document.getElementById("single-note-trainer").classList.add("visible");
    const singleNoteContainer = document.getElementById("single-note-selector-container");

    // Select elements with data-note matching any note in the array
    let chord_notes = CHORDS_TONE[_CORRECT_COLOR];
    const chord_note_elems = singleNoteContainer.querySelectorAll(chord_notes.map(note => `[data-note="${note}"]`).join(', '));
    const other_note_elems = singleNoteContainer.querySelectorAll(`[data-note]:not(${chord_notes.map(note => `[data-note="${note}"]`).join(', ')})`);

    chord_note_elems.forEach(elem => elem.classList.add("visible"));
    other_note_elems.forEach(elem => elem.classList.remove("visible"));
    singleNoteContainer.classList.add(_CORRECT_COLOR);

    // Randomly select one note as the correct note
    _CORRECT_NOTE = chord_notes[Math.floor(Math.random() * chord_notes.length)];
    _CURRENT_NOTE_AUDIO = [_CORRECT_NOTE, random_duration()];
    _CORRECT_NOTE_ELEM = singleNoteContainer.querySelector(`div[data-note="${_CORRECT_NOTE}"]`);

    // Reset state
    _NOTE_AUDIO_PLAYED = false;
    _SELECTED_NOTE_ELEM = null;

    // Play the correct note after 0.5 seconds
    setTimeout(() => {
        play_single_note_audio();
        _NOTE_AUDIO_PLAYED = true;
    }, 500);
}

function should_load_single_note_trainer(is_correct) {
    // Check settings to determine whether the single note trainer should
    // be loaded for this level and color.
    const single_note_mode = get_current_profile().single_note_mode;
    const single_note_correctness_mode = get_current_profile().single_note_correctness_mode;

    if ((single_note_correctness_mode == "only_correct" && !is_correct) ||
        (single_note_correctness_mode == "only_incorrect" && is_correct)) {
        return false;
    }

    if (single_note_mode === "always") {
        return true;
    } else if (single_note_mode === "never") {
        return false;
    } else if (is_black_level()) {
        return (single_note_mode === "all_on_black" ||
            (single_note_mode === "white_only_on_black" && !is_black_chord()));
    } else {
        return false;
    }
}

function preload_audio(color) {
    get_current_sampler();
    if (use_legacy(color)) {
        for (const audio_file of get_audio_files()["mp3"]) {
            audio_file_elem(audio_file);
        }
    }
}

function populate_audio() {
    // Choose a color at random
    select_new_color();

    if (!use_legacy(_CORRECT_COLOR)) {
        _CURRENT_AUDIO = [_CORRECT_COLOR, random_duration()];

    } else {
        const audio_files = get_audio_files();

        let new_audio_file = random_elem(audio_files.mp3.get(_CORRECT_COLOR));
        const af_elem = audio_file_elem(new_audio_file);
        _CURRENT_AUDIO = [af_elem, af_elem.duration];
    }

    let play_button = document.getElementById("play-button");
    play_button.classList.remove("deactivated");
    _AUDIO_PLAYED = false;
}


function retrieve_saved_stats() {
    // We don't want the statistics from a different selected chord level
    // or profile to carry over when we change chords or profiles, so when
    // making one of these changes, call `reset_stats(false)`, then update
    // the STATE object to the new state, then call this function to restore
    // any recent incomplete sessions.
    let current_history = get_current_session_history();
    if (current_history !== undefined && current_history.length > 0) {
        const last_session = current_history[current_history.length - 1];
        if (!last_session.done) {
            get_current_profile().stats = current_history.pop();
            if (!is_recent(last_session.updated_time)) {
                reset_stats(true);
            }
        }
    }
    update_stats_display();
}

function change_instrument(to) {
    let instrument_selector = document.getElementById("instrument-selector");

    if (to !== undefined) {
        instrument_selector.value = to;
    }

    console.log("Changing current instrument from " + STATE.current_instrument + " to " + instrument_selector.value);
    if (STATE.current_instrument !== instrument_selector.value) {
        STATE.current_instrument = instrument_selector.value;

        const current_profile = get_current_profile();
        current_profile.current_instrument = instrument_selector.value;
    }

    populate_audio();
    save_state();

    if (use_legacy()) {
        // Pre-download chord MP3s
        for (const color of _COLORS) {
            preload_audio(color);
        }
    }
}

function is_black_level(level) {
    if (level === undefined) {
        level = get_selected_colors().length;
    }
    return level > FIRST_BLACK_INDEX;
}

function is_black_chord(chord) {
    if (chord === undefined) {
        chord = _CORRECT_COLOR;
    }

    return get_selected_colors().indexOf(chord) >= FIRST_BLACK_INDEX;
}

function change_selector(to) {
    let chord_selector = document.getElementById("chord-selector");

    console.log("Changing current chord from " + STATE.current_chord +
        " to " + chord_selector.value);
    if (to !== undefined) {
        chord_selector.value = to;
    }

    const current_profile = get_current_profile();
    if (STATE.current_chord !== chord_selector.value) {
        reset_stats(false);
        STATE.current_chord = chord_selector.value;

        current_profile.current_chord = chord_selector.value;
        current_profile.stats.current_chord = current_profile.current_chord;

        retrieve_saved_stats();
    }

    _COLORS = null;
    _CHORDS_ON = (current_profile.show_chord_mode === "always"
        || (is_black_level() && current_profile.show_chord_mode === "black_only"));

    populate_flags();
    populate_audio();

    save_state();

    // Pre-download chord MP3s
    for (const color of _COLORS) {
        preload_audio(color);
    }
}

function reset_local_storage() {
    // Not exposed at the moment, useful for debugging.
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(SESSION_HISTORY_KEY);
}

function reset_stats(done = true) {
    get_current_profile().stats["done"] = done;
    if (!done || (get_current_profile().stats.identifications > 0)) {
        save_session_history();
    }
    get_current_profile().stats = new_stats();
    _CURRENT_COEFFICIENTS = null; // Trigger re-calculation of weights.
    save_state();
    update_stats_display();
    populate_audio();
}

function get_session_history() {
    let history = _SESSION_HISTORY;
    if (history === null) {
        history = localStorage.getObject(SESSION_HISTORY_KEY);
    }
    // If the history is unset or empty, we'll create a new object. If it's an
    // array it's from before the format change; since this was never used or
    // exposed before, we can just discard it.  If it's an array, we need to
    // upgrade it. The session history will be moved into "Legacy User".
    if (history === null || history.length == 0 || Array.isArray(history)) {
        history = {};
    }

    _SESSION_HISTORY = history;

    return history;
}

function get_current_target_number() {
    let target_number = get_current_profile().target_number;
    if (target_number === undefined) {
        target_number = _DEFAULT_TARGET_NUMBER;
        get_current_profile().target_number = target_number;
    }

    return target_number;
}

function get_current_session_history() {
    let full_history = get_session_history();
    const profile_id = get_current_profile()["id"];
    let histories = full_history[profile_id];
    if (histories === undefined) {
        histories = {};
        full_history[profile_id] = histories;
    }

    let history = histories[STATE.current_chord];
    if (history === undefined) {
        history = [];
        histories[STATE.current_chord] = history;
    }

    return history;
}

function pop_latest_session_history() {
    get_current_session_history();
    const profile_id = get_current_profile()["id"];

    return get_session_history()[profile_id][STATE.current_chord].pop();
}

function save_session_history() {
    let session_history = get_session_history();
    const profile_id = get_current_profile()["id"];

    let current_session_history = session_history[profile_id];
    if (current_session_history === undefined) {
        current_session_history = {};
    }

    const chord = STATE.current_chord;
    let chord_history = current_session_history[chord]
    if (chord_history === undefined) {
        chord_history = [];
        current_session_history[chord] = chord_history;
    }

    const current_stats = get_current_profile().stats;
    const last_session = chord_history[chord_history.length - 1];
    if (last_session === undefined || (current_stats.start_time !== last_session.start_time)) {
        chord_history.push(get_current_profile().stats);
    }

    session_history[profile_id] = current_session_history;
    localStorage.setObject(SESSION_HISTORY_KEY, session_history);
}

function save_state() {
    localStorage.setObject(STATE_KEY, STATE);
}

function initialize_profile_defaults(profile) {
    function initialize(val, default_value) {
        if (profile[val] === undefined) {
            profile[val] = default_value;
        }
    }

    profile_defaults = {
        show_chord_mode: _DEFAULT_SHOW_CHORD_MODE,
        reveal_chord_mode: _DEFAULT_REVEAL_CHORD_MODE,
        chord_display_mode: _DEFAULT_CHORD_DISPLAY_MODE,
        single_note_mode: _DEFAULT_SINGLE_NOTE_MODE,
        single_note_correctness_mode: _DEFAULT_SINGLE_NOTE_CORRECTNESS_MODE,
    }

    for (const [val, default_val] of Object.entries(profile_defaults)) {
        initialize(val, default_val);
    }
}

function load_state() {
    let state = localStorage.getObject(STATE_KEY);
    if (state === null) {
        let new_profiles = {};
        new_profiles[_GUEST_USER_ID] = new_profile("Guest", "fa-user", _GUEST_USER_ID);
        state = {
            profiles: new_profiles,
            current_chord: _DEFAULT_CHORD,
        }
    } else if (state["profiles"] === undefined) {
        // Need to convert old-style state into profile-based state
        let new_profiles = {};
        new_profiles[_LEGACY_USER_ID] = new_profile("Legacy User", "fa-user", _LEGACY_USER_ID);
        new_profiles[_GUEST_USER_ID] = new_profile("Guest", "fa-user", _GUEST_USER_ID);
        updated_state = {
            profiles: new_profiles,
            current_chord: state["current_chord"],
        }

        updated_state["profiles"][_LEGACY_USER_ID]["stats"] = state["stats"];
        state = updated_state;
    }

    if (state["current_profile"] === undefined || state["current_profile"] === null) {
        state["current_profile"] = _GUEST_USER_ID;
    }

    for (let profile of Object.values(state.profiles)) {
        initialize_profile_defaults(profile);
    }

    STATE = state;
}

function new_profile_from_values(values) {
    return new_profile(
        name = values.name,
        icon = values.icon,
        id = values.id,
        target_number = parseInt(values.target_number),
        show_chord_mode = values.show_chord_mode,
        reveal_chord_mode = values.reveal_chord_mode,
        chord_display_mode = values.chord_display_mode,
    );
}

function new_profile(name, icon, id, target_number=_DEFAULT_TARGET_NUMBER, show_chord_mode=_DEFAULT_SHOW_CHORD_MODE, reveal_chord_mode=_DEFAULT_REVEAL_CHORD_MODE, chord_display_mode=_DEFAULT_CHORD_DISPLAY_MODE, single_note_mode=_DEFAULT_SINGLE_NOTE_MODE, single_note_correctness_mode=_DEFAULT_SINGLE_NOTE_CORRECTNESS_MODE) {
    if (id === undefined || id === null) {
        id = _GUEST_USER_ID + 1;
        while (id in STATE["profiles"]) {
            id++;
        }
    }

    return {
        id: id,
        name: name,
        icon: icon,
        target_number: target_number,
        show_chord_mode: show_chord_mode,
        reveal_chord_mode: reveal_chord_mode,
        chord_display_mode: chord_display_mode,
        single_note_mode: single_note_mode,
        single_note_correctness_mode: single_note_correctness_mode,
        stats: new_stats(),
        current_chord: _DEFAULT_CHORD,
        current_instrument: _DEFAULT_INSTRUMENT,
    }
}

function toggle_expansion_bar() {
    let menu = document.getElementById("menu-container");
    menu.classList.toggle("visible");
}

function is_visible_infobox(ibox_elem) {
    return ibox_elem === _CURRENT_INFOBOX;
}

function toggle_visibility(ibox_elem) {
    if (is_visible_infobox(ibox_elem)) {
        _CURRENT_INFOBOX = null;
        ibox_elem.classList.remove("visible");
    } else {
        if (_CURRENT_INFOBOX !== null) {
            toggle_visibility(_CURRENT_INFOBOX);
        }

        ibox_elem.classList.add("visible");
        _CURRENT_INFOBOX = ibox_elem;
    }
}

function clear_stats_history_modal() {
    let modal = document.getElementById("stats-history-container");
    while (modal.firstChild) {
        modal.removeChild(modal.lastChild);
    }
}

function populate_stats_history_modal() {
    clear_stats_history_modal();
    let array = Object.values(get_session_history()[STATE.current_profile]).flat();
    array.sort((a, b) => b.updated_time - a.updated_time);

    let stats_container = document.getElementById("stats-history-container");

    for (const session of array) {
        const correct = session.correct;
        const identifications = session.identifications;
        const percentage = calculate_percentage(correct, identifications);
        const emoji = get_cat_emoji(calculate_neutral_level(percentage));

        if (identifications === 0) {
            continue;
        }

        const date = new Date(session.start_time * 1000);

        let div = document.createElement("div");
        div.classList.add("stats-history-item");

        let color = document.createElement("div");
        color.classList.add(session["current_chord"]);
        color.classList.add("stats-color");
        div.appendChild(color);

        let date_elem = document.createElement("div");
        date_elem.classList.add("stats-date");
        date_elem.innerText = format_datetime(date, offset = false);
        div.appendChild(date_elem);

        let stats = document.createElement("div");
        stats.classList.add("session-stats");
        stats.innerText = correct + " / " + identifications + " (" +
            percentage.toFixed(1) +
            "%) " + emoji;
        div.appendChild(stats);

        stats_container.appendChild(div);
    }
}

function clear_profile_pulldown() {
    Array.from(document.getElementsByClassName("pulldown-profile")).forEach((elem) => elem.remove());
}

function _make_profile_click_handler(elem, profile) {
    document.addEventListener("click", function(event) {
        if (!(elem.contains(event.target))) {
            return;
        }

        set_current_profile(profile);

        toggle_profile_visibility();
    });
}

function add_profile_pulldown_element(profile) {
    if (_PROFILE_CONTAINER === null) {
        _PROFILE_CONTAINER = document.getElementById("profile-container");
    }

    let pulldownContainer = _PROFILE_CONTAINER;

    let divElem = document.createElement("div");
    divElem.classList.add("pulldown-item");
    divElem.classList.add("pulldown-profile");
    divElem.dataset.profileId = profile["id"];
    _make_profile_click_handler(divElem, profile);
    pulldownContainer.insertBefore(divElem, pulldownContainer.lastElementChild);

    let iconElem = document.createElement("i");
    iconElem.classList.add("profile-icon");
    iconElem.classList.add("fa");
    iconElem.classList.add("fa-solid");
    iconElem.classList.add(profile["icon"]);
    divElem.appendChild(iconElem);

    let spanElem = document.createElement("span");
    spanElem.classList.add("profile-name");
    spanElem.textContent = profile["name"];
    divElem.appendChild(spanElem);
}

function populate_profile_pulldown() {
    if (STATE === null) {
        return;
    }

    // Remove all existing pulldown items
    clear_profile_pulldown();

    for (const profile of Object.values(STATE["profiles"])) {
        // We want to add the Guest user at the very end
        if (profile.id === _GUEST_USER_ID) {
            continue;
        }
        add_profile_pulldown_element(profile);
    }

    add_profile_pulldown_element(STATE.profiles[_GUEST_USER_ID]);
}

function get_current_profile() {
    let current_profile = STATE["current_profile"];
    if (!STATE["profiles"].hasOwnProperty(current_profile)) {
        // If we're in an illegal state where we are stuck as a deleted
        // profile, fall back to being the guest profile.
        current_profile = _GUEST_USER_ID;
        STATE["current_profile"] = current_profile;
        set_current_profile(STATE[current_profile]);
    }
    return STATE["profiles"][current_profile];
}

function select_new_profile(elem) {
    const id = elem.dataset.profileId;
    STATE["current_profile"] = id;
    set_current_profile(STATE["profiles"][id]);
}

function open_profile_adder() {
    console.log("Creating new profile");

    toggle_profile_visibility();
    toggle_profile_settings_visibility(false);
    clear_profile_dialog();
    let profile_container = document.getElementById("profile-info-container");

    for (var elem of profile_container.querySelectorAll("button.add-button")) {
        elem.classList.add("visible");
    }

    document.getElementById("profile_name_setting").disabled = false;

    let target_number_elem = document.getElementById("target_number_setting");
    target_number_elem.value = _DEFAULT_TARGET_NUMBER;
}

function close_profile_adder() {
    console.log("Closing profile adder");
    toggle_profile_settings_visibility();
    clear_profile_dialog();
}

function add_profile() {
    let new_profile_values = get_profile_settings();
    let name_taken = is_profile_name_taken(new_profile_values.name);
    let target_num_valid = valid_int(new_profile_values.target_number);

    if (new_profile_values.icon === null || new_profile_values.name === "") {
        alert("Must specify a profile name and icon.")
    } else if (name_taken) {
        alert("A profile with the name " + new_profile_values.name + " already  exists.");
    } else if (!target_num_valid) {
        alert("Target number must be a valid integer, got " + new_profile_values.target_number);
    } else {
        const profile = new_profile_from_values(new_profile_values);
        STATE.profiles[profile.id] = profile;
        save_state();
        populate_profile_pulldown();
        close_profile_adder();
        set_current_profile(profile);
    }
}

function get_checked_icon_selector_setting_elem() {
    const profile_name_element = document.getElementById("profile-info-container");
    for (const elem of profile_name_element.querySelectorAll("input[name='profile_icon_selector']")) {
        if (elem.checked) {
            return elem;
        }
    }

    return null;
}

function is_profile_name_taken(profile_name) {
    let name_taken = false;
    for (const profile of Object.values(STATE.profiles)) {
        if (profile.name.toLowerCase() === profile_name.toLowerCase()) {
            name_taken = true;
        }
    }

    return name_taken;
}

function valid_int(s) {
    return parseInt(s) == s;
}

function get_profile_settings() {
    let profile_container = document.getElementById("profile-info-container");

    const profile_name_element = document.getElementById("profile_name_setting");
    const profile_name = profile_name_element.value;

    let profile_icon = null;
    let checked_icon_elem = get_checked_icon_selector_setting_elem();
    if (checked_icon_elem !== null) {
        profile_icon = checked_icon_elem.value;
    }

    let id = JSON.parse(profile_container.dataset.id);

    const show_chord_elem = document.getElementById("show-chord-name-mode-selector");
    const show_chord_mode = show_chord_elem.value;

    const reveal_chord_mode_elem = document.getElementById("chord-reveal-mode-selector");
    const reveal_chord_mode = reveal_chord_mode_elem.value;


    const chord_display_mode_elem = document.getElementById("chord-name-display-mode-selector");
    const chord_display_mode = chord_display_mode_elem.value;

    const single_note_mode_elem = document.getElementById("single-note-trainer-mode-selector");
    const single_note_mode = single_note_mode_elem.value;

    const single_note_correctness_mode_elem = document.getElementById("single-note-trainer-correctness-mode-selector");
    const single_note_correctness_mode = single_note_correctness_mode_elem.value;

    const target_number_elem = document.getElementById("target_number_setting");
    let target_number = target_number_elem.value;

    return {
        name: profile_name,
        icon: profile_icon,
        id: id,
        target_number: target_number,
        show_chord_mode: show_chord_mode,
        reveal_chord_mode: reveal_chord_mode,
        chord_display_mode: chord_display_mode,
        single_note_mode: single_note_mode,
        single_note_correctness_mode: single_note_correctness_mode,
    }
}

function clear_profile_dialog() {
    let profile_dialog = document.getElementById("profile-info-container");

    // Uncheck the radio button
    let checked_icon_elem = get_checked_icon_selector_setting_elem();
    if (checked_icon_elem !== null) {
        checked_icon_elem.checked = false;
    }

    // Clear all text fields
    for (let elem of profile_dialog.querySelectorAll("input[type='text']")) {
        elem.value = "";
    }

    for (let elem of profile_dialog.querySelectorAll("button.button")) {
        elem.classList.remove("visible");
    }

    let show_chord_name_mode = profile_dialog.querySelector("select#show-chord-name-mode-selector");
    show_chord_name_mode.value = _DEFAULT_SHOW_CHORD_MODE;

    let chord_display_mode_elem = profile_dialog.querySelector("select#chord-name-display-mode-selector");
    chord_display_mode_elem.value = _DEFAULT_CHORD_DISPLAY_MODE;

    let single_note_mode_elem = document.getElementById("single-note-trainer-mode-selector");
    single_note_mode_elem.value = _DEFAULT_SINGLE_NOTE_MODE;

    let single_note_correctness_mode_elem = document.getElementById("single-note-trainer-correctness-mode-selector");
    single_note_correctness_mode_elem.value = _DEFAULT_SINGLE_NOTE_CORRECTNESS_MODE;


    profile_dialog.dataset.id = null;
}

function populate_profile_settings() {
    let profile = get_current_profile();
    console.log("Modifying settings for " + profile["name"]);
    const is_guest = (profile.id === _GUEST_USER_ID);
    clear_profile_dialog();
    let profile_dialog = document.getElementById("profile-info-container");
    for (let elem of profile_dialog.querySelectorAll("button.settings-button")) {
        elem.classList.add("visible");
    }

    let profile_name_elem = document.getElementById("profile_name_setting");
    profile_name_elem.value = profile["name"];

    for (var elem of profile_dialog.querySelectorAll("input[name='profile_icon_selector']")) {
        if (elem.value === profile["icon"]) {
            elem.checked = true;
            break;
        }
    }
    let target_number_elem = document.getElementById("target_number_setting");
    target_number_elem.value = profile.target_number;

    let show_chord_mode_elem = document.getElementById("show-chord-name-mode-selector");
    show_chord_mode_elem.value = profile.show_chord_mode;

    let reveal_chord_mode_elem = document.getElementById("chord-reveal-mode-selector");
    reveal_chord_mode_elem.value = profile.reveal_chord_mode;

    let chord_display_mode_elem = document.getElementById("chord-name-display-mode-selector");
    chord_display_mode_elem.value = profile.chord_display_mode;

    let single_note_mode_elem = document.getElementById("single-note-trainer-mode-selector");
    single_note_mode_elem.value = profile.single_note_mode;

    let single_note_correctness_mode_elem = document.getElementById("single-note-trainer-correctness-mode-selector");
    single_note_correctness_mode_elem.value = profile.single_note_correctness_mode;

    profile_dialog.dataset.id = profile["id"];

    // It is not allowed to delete the guest user or change its name.
    let delete_button_elem = document.getElementById("delete-profile-button");
    if (is_guest) {
        profile_name_elem.disabled = true;
        delete_button_elem.disabled = true;
    } else {
        profile_name_elem.disabled = false;
        delete_button_elem.disabled = false;
    }


}

function submit_profile_changes() {
    const profile_values = get_profile_settings();
    let current_profile = STATE.profiles[profile_values.id];
    if (current_profile.name !== profile_values.name && !is_profile_name_taken(profile_values.name)) {
        alert("The name " + profile_values.name + " is taken, please choose another one.");
        return;
    }

    if (profile_values.icon === null) {
        alert("Must specify an icon!");
        return;
    }

    if (!valid_int(current_profile.target_number)) {
        alert("Must specify a valid target number, got: " + current_profile.target_number);
        return;
    }

    current_profile.name = profile_values.name;
    current_profile.icon = profile_values.icon;
    current_profile.target_number = parseInt(profile_values.target_number);
    current_profile.show_chord_mode = profile_values.show_chord_mode;
    current_profile.reveal_chord_mode = profile_values.reveal_chord_mode;
    current_profile.chord_display_mode = profile_values.chord_display_mode;
    current_profile.single_note_mode = profile_values.single_note_mode;
    current_profile.single_note_correctness_mode = profile_values.single_note_correctness_mode;

    save_state();
    populate_profile_pulldown();

    if (profile_values.id === get_current_profile().id) {
        // Do this to update the icon
        set_current_profile(get_current_profile());
    }
    close_profile_adder();
}

function delete_profile() {
    const profile_container = document.getElementById("profile-info-container");
    const profile_id = JSON.parse(profile_container.dataset.id);
    if (profile_id == _GUEST_USER_ID) {
        alert("Deleting the guest user is not allowed.");
        return;
    } else if (confirm("Are you sure you want to delete the profile " + STATE.profiles[profile_id].name + "?")) {
        // Set the current profile to the guest profile
        set_current_profile_by_id(_GUEST_USER_ID);
        delete STATE.profiles[profile_id];
    }

    save_state();
    populate_profile_pulldown();
    close_profile_adder();
}

function populate_profile_ui_elements() {
    const profile = get_current_profile();
    let profileIconElem = document.getElementById("profile-icon");
    if (profileIconElem.dataset.userIcon !== undefined) {
        profileIconElem.classList.remove(profileIconElem.dataset.userIcon);
    }

    const user_icon = profile["icon"];
    profileIconElem.classList.add(user_icon);
    profileIconElem.dataset.userIcon = user_icon;

    let profileNameSpanElem = document.getElementById("profile-text");
    profileNameSpanElem.textContent = profile["name"];
}

function set_chord_display_mode(chord_mode) {
    use_shapes = true;
    use_letters = true;
    if (chord_mode == "shapes_only") {
        use_letters = false;
    } else if (chord_mode == "letters_only") {
        use_shapes = false;
    }

    const note_holders = [
        document.getElementById("flag-holder"),
        document.getElementById("single-note-selector-container")
    ];


    for (const holder_elem of note_holders) {
        if (use_shapes) {
            holder_elem.classList.add("use-shapes");
        } else {
            holder_elem.classList.remove("use-shapes");
        }

        if (use_letters) {
            holder_elem.classList.add("use-letters");
        } else {
            holder_elem.classList.remove("use-letters");
        }
    }
}


function set_current_profile_by_id(profile_id) {
    let profile = STATE["profiles"][profile_id];
    return set_current_profile(profile);
}

function set_current_profile(profile) {
    if (profile.id !== get_current_profile().id) {
        // Reset the stats and retrieve any existing sessions
        reset_stats(false);
        STATE.current_profile = profile.id;
    }

    if (profile.current_chord === undefined) {
        profile.current_chord = _DEFAULT_CHORD;
    }

    if (profile.current_instrument === undefined) {
        profile.current_instrument = _DEFAULT_INSTRUMENT;
    }

    normalize_stats_object(profile.stats); // Account for changes in the stats object format
    populate_profile_ui_elements();
    set_chord_display_mode(profile.chord_display_mode);

    // Instrument must come first
    change_instrument(profile.current_instrument);
    change_selector(profile.current_chord);

    save_state();
}

function populate_infobox_triggers() {
    for (const trigger_id of _INFOBOX_TRIGGER_IDS) {
        _INFOBOX_TRIGGERS.push(document.getElementById(trigger_id));
    }
}

function toggle_profile_visibility() {
    toggle_visibility(document.getElementById("profile-container"));
}

function toggle_trainer_visibility() {
    toggle_visibility(document.getElementById("trainer-infobox"));
    if (!_TRAINER_PRELOADED) {
        for (const color of Object.keys(CHORDS_TONE)) {
            preload_audio(color);
        }
    }
}

function toggle_infobox_visibility() {
    toggle_visibility(document.getElementById("i-infobox"));
}

function toggle_stats_history_visibility() {
    populate_stats_history_modal();
    toggle_visibility(document.getElementById("stats-history-container"));
}

function toggle_profile_settings_visibility(populate=true) {
    const ibox = document.getElementById("profile-info-container");
    if (ibox.classList.contains("visible")) {
        ibox.classList.remove("visible");
    } else {
        if (populate) {
            populate_profile_settings();
        }
        ibox.classList.add("visible");
    }
}

function toggle_theme_mode() {
    document.body.classList.toggle("colorscheme-dark");
    document.body.classList.toggle("colorscheme-light");
}

function enable_download() {
    if (_DOWNLOAD_ENABLED_CLICKS === -1) {
        return;
    }
    let time_since_last_click = 0;
    if (_DOWNLOAD_ENABLED_LAST_CLICK !== null) {
        time_since_last_click = get_current_timestamp() - _DOWNLOAD_ENABLED_LAST_CLICK;
    }

    if (time_since_last_click > 1.5) {
        _DOWNLOAD_ENABLED_CLICKS = 0;
    }

    if (_DOWNLOAD_ENABLED_CLICKS < 5) {
        _DOWNLOAD_ENABLED_CLICKS++;
        _DOWNLOAD_ENABLED_LAST_CLICK = get_current_timestamp();
        return;
    }


    _DOWNLOAD_ENABLED_CLICKS = -1;

    let elem = document.getElementById("download-link");
    elem.classList.add("visible");
}

function trigger_easter_egg() {
    if (_EASTER_EGG_ENABLED === true) {
        return;
    }
    let time_since_last_click = 0;
    if (_EASTER_EGG_LAST_CLICK !== null) {
        time_since_last_click = get_current_timestamp() - _EASTER_EGG_LAST_CLICK;
    }

    if (time_since_last_click > 1.5) {
        _EASTER_EGG_LAST_CLICK = 0;
    }

    if (_EASTER_EGG_LAST_CLICK < 5) {
        _EASTER_EGG_LAST_CLICK++;
        _EASTER_EGG_LAST_CLICK = get_current_timestamp();
        return;
    }

    _EASTER_EGG_ENABLED = true;

    let chord_elem = document.getElementById("chord-selector");
    for (var opt_elem of chord_elem.options) {
        if (opt_elem.value === "red") {
            opt_elem.removeAttribute("hidden");
        }
    }
}

function download_state() {
    const state_json = JSON.stringify({
        state: STATE,
        history: get_session_history()
    }, null, 2);
    const data = new Blob([state_json]);

    let download_elem = document.createElement("a");
    download_elem.href = URL.createObjectURL(data);
    download_elem.download = "cim_state_" + Math.round(get_current_timestamp()) + ".json"
    download_elem.click();
    download_elem.remove();
}

const WEEK_SECONDS = 7 * 24 * 3600;

function get_current_coefficients() {
    if (_CURRENT_COEFFICIENTS !== null) {
        return _CURRENT_COEFFICIENTS;
    }
    let current_time = get_current_timestamp();
    const unfiltered_session_history = get_current_session_history();

    // Look at the most recent 1 week of identifications for the specified
    // color, where "most recent" is defined as the week leading up to the
    // most recent session taken to completion.
    if (unfiltered_session_history.length > 1) {
        current_time = Math.max(...unfiltered_session_history.map(
        (x) => (x.identifications >= Math.min(get_current_target_number(), 25)) ? x.start_time : 0));
    }

    const recent_confusion_matrices = unfiltered_session_history
        .filter((x) => (current_time - x.start_time) < WEEK_SECONDS)
        .map((x) => x.confusion_matrix);
    const num_chords = Object.keys(CHORDS_TONE).indexOf(STATE.current_chord) + 1;

    const matrix = merge_matrices(recent_confusion_matrices, num_chords);

    return calculate_coefficients(matrix);
}

function merge_matrices(confusion_matrices, num_chords) {
    // Initialize to all zeroes
    let chords = Object.keys(CHORDS_TONE).slice(0, num_chords);
    let out_matrix = Object.fromEntries(chords.map((x) => [x, Object.fromEntries(chords.map((x) => [x, 0]))]));
    for (const cm of confusion_matrices) {
        for (const ok of Object.keys(cm)) {
            for (const ik of Object.keys(cm[ok])) {
                out_matrix[ok][ik] = out_matrix[ok][ik] + cm[ok][ik];
            }
        }
    }

    return out_matrix;
}

function normalize_array_masked(arr, mask) {
    const norm_to = 1 - sum(arr.filter((_, i) => mask[i]));
    const norm_factor = sum(arr.filter((_, i) => !mask[i])) / norm_to;
    return arr.map((val, i) => (mask[i]) ? val : val / norm_factor);
}

function calculate_coefficients(matrix, wrong_weight = 5.0, mistaken_for_weight = 1.5, threshold = 5) {
    // For adaptive learning mode, we want to adjust the frequency inversely with
    // both the frequency that the user got the chord wrong *and* the frequency
    // that the user mistakenly chose the color in question. So if the user
    // consistently mistakes blue for red (but never mistakes red for blue),
    // we want to show blue more frequently *and* red more frequently, but with
    // different coefficients.
    //
    // The non-normalized coefficient for chord i (c_i) is calculated from the
    // matrix M with weights w_w (weight given to each wrong answer when the
    // correct answer is chord i) and w_m (weight given to each wrong answer
    // when chord i was chosen) as follows:
    //
    // c_i = f_i * (M_{i,i} + w_w*(Σ_{k≠i}M_{i,k}) + w_m*(Σ_{k≠i}M_{k,i})
    //
    // Where the factor f_i is given by:
    //
    // f_i = Σ_{k} M_{i,k}.
    //
    // If f_i is less than the threshold value, the final, normalized
    // coefficient is set to 1/len(c), and all other coefficients are
    // re-normalized accordingly. The minimum value of all coefficients is
    // set to 1/(10 + len(c), except the most recent chord, which has a
    // minimum coefficient of 1 / len(c); if the natural coefficient for
    // a given chord falls below the minimum coefficient, it is set to the
    // minimum value, and all other coefficients are adjusted accordingly
    // (except for those with no entries, which will always be fixed at
    // (1/len(c)).
    const chords = Object.keys(matrix);
    const num_chords = chords.length;
    const default_value = 1 / num_chords;
    let coefficients = new Array(num_chords).fill(0);
    let num_chances = new Array(num_chords).fill(0);
    let min_values = new Array(num_chords).fill(1 / (10 + num_chords));
    min_values[num_chords - 1] = 1 / num_chords;

    // Populate with un-normalized values
    for (const [correct_index, correct_chord] of chords.entries()) {
        for (const [chosen_index, chosen_chord] of chords.entries()) {
            const value = matrix[correct_chord][chosen_chord];
            if (value === undefined) {
                continue;
            }
            if (chosen_index != correct_index) {
                coefficients[correct_index] += value * wrong_weight;
                coefficients[chosen_index] += value * mistaken_for_weight;
            } else {
                coefficients[correct_index] += value;
            }
            num_chances[correct_index] += value;
        }
    }

    // First establish the mask and fix the masked values
    let mask = num_chances.map((x) => x < threshold);
    coefficients = coefficients.map((value, i) => mask[i] ? default_value : value);

    // Iteratively normalize
    let normalized = false;
    while (!normalized) {
        coefficients = normalize_array_masked(coefficients, mask);
        normalized = true;
        for (const [index, value] of coefficients.entries()) {
            const min_coefficient = min_values[index];
            if (value < min_coefficient) {
                mask[index] = true;
                coefficients[index] = min_coefficient;
                normalized = false;
                break;
            }
        }
    }

    return coefficients;
}

function clean_session_history() {
    console.log("Cleaning session history");
    let full_history = get_session_history();
    // Remove any sessions that have 0 identifications, and for any
    // remaining sessions, make sure that the chord recorded is the right one
    // (this only applies to sessions recorded before a certain bug was fixed).
    for (let profile_history of Object.values(full_history)) {
        // There is a bug that can occur when you use the "red" easter egg where
        // the session is saved with an empty chord. We will just remove these,
        // as they are not important.
        if (profile_history[""] !== undefined) {
            delete profile_history[""];
        }

        for (const chord of Object.keys(profile_history)) {
            profile_history[chord] = profile_history[chord].filter(
                    (o) => o.identifications || (!o.done && is_recent(o.updated_time)))
                .map(function(o) {
                    if (o.current_chord != chord) {
                        o.current_chord = chord;
                    }

                    return o;
                })
                .reduce((accumulator, value) => {
                    // Remove duplicates
                    const last_session = accumulator[accumulator.length - 1];
                    if (last_session === undefined || value.identifications !== last_session.identifications ||
                        value.start_time !== last_session.start_time) {
                        accumulator.push(value);
                    }

                    return accumulator;

                }, []);
        }
    }

    save_session_history();
}

document.addEventListener("DOMContentLoaded", function() {
    load_state();

    const profile = get_current_profile();

    let stats = profile.stats;
    if (stats !== undefined && stats.updated_time !== undefined) {
        if (!is_recent(stats.updated_time)) {
            reset_stats();
        }
    }

    populate_profile_ui_elements();
    set_chord_display_mode(profile.chord_display_mode);
    change_instrument(profile.current_instrument);
    change_selector(profile.current_chord);
    populate_infobox_triggers();
    populate_profile_pulldown();
    update_stats_display();
    clean_session_history();
});

document.addEventListener("click", function(event) {
    if (_CURRENT_INFOBOX === null || _CURRENT_INFOBOX.contains(event.target)) {
        return;
    }

    for (const infobox_trigger of _INFOBOX_TRIGGERS) {
        if (infobox_trigger.contains(event.target)) {
            return;
        }
    }

    toggle_visibility(_CURRENT_INFOBOX);
});

// Support storing and retrieving objects from localStorage
Storage.prototype.setObject = function(key, value) {
    this.setItem(key, JSON.stringify(value));
}

Storage.prototype.getObject = function(key) {
    var value = this.getItem(key);
    return value && JSON.parse(value);
}
