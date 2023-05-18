const CHORDS = [
    ["red", "ceg",],
    ["yellow", "cfa",],
    ["blue", "hdg",],
    ["black", "acf",],
    ["green", "dgh",],
    ["orange", "egc",],
    ["purple", "fac",],
    ["pink", "ghd",],
    ["brown", "gce",],
];

function get_current_timestamp() {
    return Date.now() / 1000;
}

function new_stats() {
    return {
        start_time: get_current_timestamp(),
        updated_time: get_current_timestamp(),
        identifications: 0,
        correct: 0,
        confusion_matrix: {},
    }
}

let _COLORS = null;
let _CORRECT_COLOR = null;
let _SELECTED_ELEM = null;
let _CORRECT_ELEM = null;
let _CURRENT_AUDIO = null;
let AUDIO_FILES = null;

const STATE_KEY = "cim_state";
const SESSION_HISTORY_KEY = "cim_session_history";

let STATE = null;

function get_selected_colors() {
    const chord_idx = document.getElementById("chord-selector").selectedIndex;
    if (_COLORS === null) {
        _COLORS = CHORDS.slice(0, chord_idx + 1).map(([x, _]) => x);
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
        inner_div.style.background = flag_color;

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
        audio_file.elem.src = "/apps/cim/resources/" + audio_file.filename;
    }

    return audio_file.elem;
}

function random_elem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function select_new_color() {
    _CORRECT_COLOR = random_elem(get_selected_colors());
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
    STATE.stats.identifications++;
    if (correct) {
        STATE.stats.correct++;
    }

    if (STATE.stats.confusion_matrix[correct_color] === undefined) {
        STATE.stats.confusion_matrix[correct_color] = {};
    }

    let row = STATE.stats.confusion_matrix[correct_color];
    if (row[chosen_color] === undefined) {
        row[chosen_color] = 0;
    }

    row[chosen_color] = row[chosen_color] + 1;

    STATE.stats.updated_time = get_current_timestamp();
    save_state();
}

function update_stats_display() {
    let correct_elem = document.getElementById("stats-correct");
    let total_elem = document.getElementById("stats-total");

    correct_elem.innerHTML = STATE.stats.correct;
    total_elem.innerHTML = STATE.stats.identifications;
}

function select_flag(elem) {
    if (_SELECTED_ELEM !== null) {
        return;
    }
    const id = elem.parentElement.id;
    const chosen_color = id.split("-")[0];

    update_stats(_CORRECT_COLOR, chosen_color);
    update_stats_display();

    if (chosen_color === _CORRECT_COLOR) {
        elem.classList.add("flag-correct");
    } else {
        elem.classList.add("flag-incorrect");
        _CORRECT_ELEM = document.getElementById(_CORRECT_COLOR + "-flag").firstChild;
        _CORRECT_ELEM.classList.add("flag-correct");
    }
    _SELECTED_ELEM = elem;

    let next_button = document.getElementById("next-chord");
    next_button.classList.remove("deactivated");
}

function play_audio() {
    if (document.getElementById("play-button").classList.contains("deactivated")) {
        return;
    }
    _CURRENT_AUDIO.play();

}

function next_audio() {
    let next_button = document.getElementById("next-chord");
    if (next_button.classList.contains("deactivated")) {
        return;
    }
    populate_audio();
    _CURRENT_AUDIO.play();

    next_button.classList.add("deactivated");
}

function populate_audio() {
    const audio_files = get_audio_files();

    // Choose a color at random
    select_new_color();
    let new_audio_file = random_elem(audio_files.mp3.get(_CORRECT_COLOR));
    _CURRENT_AUDIO = audio_file_elem(new_audio_file);

    let play_button = document.getElementById("play-button");
    play_button.classList.remove("deactivated");
}

function change_selector(to) {
    let chord_selector = document.getElementById("chord-selector");
    if (to !== undefined) {
        chord_selector.value = to;
    }
    _COLORS = null;
    populate_flags();
    populate_audio();
    STATE.current_chord = chord_selector.value;
    save_state();
}

function reset_local_storage() {
    // Not exposed at the moment, useful for debugging.
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(SESSION_HISTORY_KEY);
}

function reset_stats() {
    save_session_history();
    STATE.stats = new_stats();
    save_state();
    update_stats_display();
}

function get_session_history() {
    let history = localStorage.getObject(SESSION_HISTORY_KEY);
    if (history === null) {
        return [];
    } else {
        return history;
    }
}

function save_session_history() {
    let session_history = get_session_history();
    session_history.push(STATE.stats);
    localStorage.setObject(SESSION_HISTORY_KEY, session_history);
}

function save_state() {
    localStorage.setObject(STATE_KEY, STATE);
}

function load_state() {
    let state = localStorage.getObject(STATE_KEY);
    if (state === null) {
        state = {
            stats: new_stats(),
            current_chord: document.getElementById("chord-selector").value,
        }
    };

    STATE = state;
}

document.addEventListener("DOMContentLoaded", function() {
    load_state();
    change_selector(STATE.current_chord);
    update_stats_display();
});

// Support storing and retrieving objects from localStorage
Storage.prototype.setObject = function(key, value) {
    this.setItem(key, JSON.stringify(value));
}

Storage.prototype.getObject = function(key) {
    var value = this.getItem(key);
    return value && JSON.parse(value);
}
