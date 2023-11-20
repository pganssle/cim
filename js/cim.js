let TONE_SAMPLERS = {};

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
            TONE_SAMPLERS[instrument] = new Tone.Sampler({
                urls: instrument_info.sample_files,
                release: 1,
                baseUrl: instrument_info.base_url,
            }).toDestination();
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

function new_stats() {
    return {
        current_chord: STATE !== null ? STATE.current_chord : _DEFAULT_CHORD,
        start_time: get_current_timestamp(),
        updated_time: get_current_timestamp(),
        identifications: 0,
        correct: 0,
        confusion_matrix: {},
        done: false,
    }
}

let _COLORS = null;
let _CORRECT_COLOR = null;
let _CURRENT_COEFFICIENTS = null;
let _SELECTED_ELEM = null;
let _CORRECT_ELEM = null;
let _CURRENT_AUDIO = null;
let _CURRENT_INFOBOX = null;
let _PROFILE_CONTAINER = null;
let _INFOBOX_TRIGGERS = [];
let _AUDIO_PLAYED = false;
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

const _INFOBOX_TRIGGER_IDS = [
    "trainer-infobox-trigger",
    "i-infobox-trigger",
    "profile-infobox-trigger",
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
    if (AUDIO_FILES === null) {
        AUDIO_FILES = {
            "mp3": new Map(),
            "opus": new Map(),
        };
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

function make_flag(flag_color) {
    const wrapper_id = flag_color + "-flag";
    let wrapper_div = document.getElementById(wrapper_id);
    if (wrapper_div === null) {
        wrapper_div = document.createElement("div");
        wrapper_div.classList.add("flag-wrapper");
        wrapper_div.id = wrapper_id;

        let inner_div = document.createElement("div");
        inner_div.classList.add("flag");
        inner_div.classList.add("fa");
        inner_div.classList.add(flag_color);

        inner_div.onclick = () => select_flag(inner_div);
        wrapper_div.appendChild(inner_div);
    }

    return wrapper_div;
}

function populate_flags() {
    const colors = get_selected_colors();
    const base_elem = document.getElementById("flag-holder");

    while (base_elem.firstChild) {
        base_elem.removeChild(base_elem.lastChild);
    }

    for (const color of colors) {
        const flag = make_flag(color);
        base_elem.appendChild(flag);
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

function random_duration(mean=0.85, stdev=0.85, min=0.5, max=1.5) {
    return clip(normal_random(mean, stdev), 0.5, 1.5);
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
    let correct_elem = document.getElementById("stats-correct");
    let total_elem = document.getElementById("stats-total");
    let perc_elem = document.getElementById("stats-percent");

    const stats = get_current_profile().stats;
    const correct = stats.correct;
    const identifications = stats.identifications;

    correct_elem.innerHTML = correct;
    total_elem.innerHTML = identifications;
    let percentage = calculate_percentage();
    if (identifications > 0) {
        perc_elem.innerHTML = "(" + percentage.toFixed(1) + "%)";
    } else {
        perc_elem.innerHTML = "";
    }

    if (correct == identifications) {
        container_elem.classList.add("perfect");
    } else {
        container_elem.classList.remove("perfect");
    }

    if (identifications >= get_current_target_number()) {
        container_elem.classList.add("done");
    } else {
        container_elem.classList.remove("done");
    }

    if (!_EMOJI_LOCK) {
        reset_cat_emoji();
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
    const id = elem.parentElement.id;
    const chosen_color = id.split("-")[0];

    _EMOJI_LOCK = true;
    update_stats(_CORRECT_COLOR, chosen_color);
    update_stats_display();

    if (chosen_color === _CORRECT_COLOR) {
        elem.classList.add("flag-correct");
        set_cat_emoji(6);
    } else {
        elem.classList.add("flag-incorrect");
        _CORRECT_ELEM = document.getElementById(_CORRECT_COLOR + "-flag").firstChild;
        _CORRECT_ELEM.classList.add("flag-correct");
        set_cat_emoji(5)
    }
    _SELECTED_ELEM = elem;

    setTimeout(function() {
        _EMOJI_LOCK = false;
        reset_cat_emoji();
    }, 1500);

    let next_button = document.getElementById("next-chord");
    next_button.classList.remove("deactivated");
}

function set_played_after(delay) {
    setTimeout(() => {
        _AUDIO_PLAYED = true;
    },
    delay
    );
}

// Standard Normal variate using Box-Muller transform.
function play_chord_tone(chord_name, duration) {
    const chord = CHORDS_TONE[chord_name];

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

    const [chord, duration] = _CURRENT_AUDIO;

    set_played_after(duration * 0.8);
    play_chord(chord, duration);
}

function play_chord_files(color) {
    const audio_files = get_audio_files();
    const audio_file = random_elem(audio_files["mp3"].get(color));
    audio_file_elem(audio_file).play();
}

function play_chord(color, duration=null) {
    if (use_legacy(color)) {
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
    populate_audio();
    play_audio();

    next_button.classList.add("deactivated");
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

function change_selector(to) {
    let chord_selector = document.getElementById("chord-selector");

    console.log("Changing current chord from " + STATE.current_chord +
        " to " + chord_selector.value);
    if (to !== undefined) {
        chord_selector.value = to;
    }

    if (STATE.current_chord !== chord_selector.value) {
        reset_stats(false);
        STATE.current_chord = chord_selector.value;

        const current_profile = get_current_profile();
        current_profile.current_chord = chord_selector.value;
        current_profile.stats.current_chord = current_profile.current_chord;

        retrieve_saved_stats();
    }

    _COLORS = null;
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

    STATE = state;
}

function new_profile_from_values(values) {
    return new_profile(
        name = values.name,
        icon = values.icon,
        id = values.id,
        target_number = parseInt(values.target_number),
    );
}

function new_profile(name, icon, id, target_number=_DEFAULT_TARGET_NUMBER) {
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
        stats: new_stats(),
        current_chord: _DEFAULT_CHORD,
        current_instrument: _DEFAULT_INSTRUMENT,
    }
}

function toggle_visibility(ibox_elem) {
    if (ibox_elem === _CURRENT_INFOBOX) {
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

        if (event.target.classList.contains("profile-settings-icon")) {
            profile_settings(profile);
        } else {
            set_current_profile(profile);
        }

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

    if (profile.id !== _GUEST_USER_ID) {
        let settingsIconElem = document.createElement("i");
        settingsIconElem.classList.add("profile-settings-icon");
        settingsIconElem.classList.add("fa");
        settingsIconElem.classList.add("fa-solid");
        settingsIconElem.classList.add("fa-gear");
        divElem.appendChild(settingsIconElem);
    }

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
    return STATE["profiles"][STATE["current_profile"]];
}

function select_new_profile(elem) {
    const id = elem.dataset.profileId;
    STATE["current_profile"] = id;
    set_current_profile(STATE["profiles"][id]);
}

function open_profile_adder() {
    console.log("Creating new profile");

    clear_profile_dialog();
    let profile_container = document.getElementById("profile-info-container");
    profile_container.classList.add("visible");

    for (var elem of profile_container.querySelectorAll("button.add-button")) {
        elem.classList.add("visible");
    }

    let target_number_elem = document.getElementById("target_number_setting");
    target_number_elem.value = _DEFAULT_TARGET_NUMBER;

    toggle_profile_visibility();
}

function close_profile_adder() {
    console.log("Closing profile adder");
    let profile_container = document.getElementById("profile-info-container");
    profile_container.classList.remove("visible");
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

    const target_number_elem = document.getElementById("target_number_setting");
    let target_number = target_number_elem.value;

    return {
        name: profile_name,
        icon: profile_icon,
        id: id,
        target_number: target_number,
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

    profile_dialog.dataset.id = null;
}

function profile_settings(profile) {
    console.log("Modifying settings for " + profile["name"]);
    clear_profile_dialog();
    let profile_dialog = document.getElementById("profile-info-container");
    profile_dialog.classList.add("visible");
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

    profile_dialog.dataset.id = profile["id"];
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
    if (confirm("Are you sure you want to delete the profile " + STATE.profiles[profile_id].name + "?")) {
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

function set_current_profile(profile) {
    if (profile.id === get_current_profile().id) {
        return;
    }

    // Reset the stats and retrieve any existing sessions
    reset_stats(false);
    STATE.current_profile = profile.id;

    if (profile.current_chord === undefined) {
        profile.current_chord = _DEFAULT_CHORD;
    }

    if (profile.current_instrument === undefined) {
        profile.current_instrument = _DEFAULT_INSTRUMENT;
    }

    populate_profile_ui_elements();

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
