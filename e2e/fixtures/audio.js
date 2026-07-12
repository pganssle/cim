// Test fixture that instruments the Web Audio API so tests can assert on
// real audio behavior: whether sound was scheduled, whether actual signal
// reached the output, and whether the legacy <audio>-element path was used.
//
// The probe is installed by an init script that runs before any page script,
// so it wraps the native prototypes that Tone.js (and the legacy player)
// ultimately call into:
//
//  - AudioScheduledSourceNode.start() is the deterministic "sound was
//    scheduled" signal (a triad schedules one buffer source per note).
//  - Any node connected to an AudioDestinationNode is also tapped into an
//    AnalyserNode; max_rms() measures actual signal energy, which works in
//    headless Chromium (the audio graph renders against a null device).
//  - HTMLMediaElement.play() counts uses of the legacy pre-recorded mp3 path,
//    which does not go through Web Audio at all.
import { test as base, expect } from "@playwright/test";

export { expect };

function install_audio_probe() {
    const probe = {
        starts: [],
        media_plays: 0,
        contexts: [],
        analysers: [],
        max_rms_seen: 0,
    };
    window.__audio_probe = probe;

    // AudioBufferSourceNode defines its own start() (its signature takes
    // offset/duration parameters), which shadows the base class method, so
    // both prototypes have to be patched. Tone.js also start()s silent
    // internal nodes (oscillators and constant sources used as control
    // signals) at load, so the node type is recorded to tell actual sound
    // (buffer sources, in this app) apart from plumbing.
    for (const node_class of [AudioScheduledSourceNode, AudioBufferSourceNode]) {
        const orig_start = node_class.prototype.start;
        node_class.prototype.start = function(...args) {
            probe.starts.push({
                type: this.constructor.name,
                // Tone's audio-context shim feature-tests buffer sources at
                // startup, both on throwaway OfflineAudioContexts and on the
                // real context with an empty (silent) buffer; neither makes
                // sound. Recording the context type and buffer length lets
                // audio_starts() exclude them.
                offline: this.context instanceof OfflineAudioContext,
                buffer_duration: this.buffer !== null && this.buffer !== undefined
                    ? this.buffer.duration : 0,
                when: args.length > 0 ? args[0] : null,
                context_time: this.context.currentTime,
            });
            return orig_start.apply(this, args);
        };
    }

    const orig_connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function(destination, ...args) {
        // Tap anything routed to the real output into an analyser so that
        // max_rms() can see the actual signal. OfflineAudioContexts are
        // skipped; Tone's audio-context shim creates throwaway ones for
        // feature detection.
        if (destination instanceof AudioDestinationNode &&
            this.context instanceof AudioContext) {
            const analyser = this.context.createAnalyser();
            analyser.fftSize = 2048;
            orig_connect.call(this, analyser);
            probe.analysers.push(analyser);
        }
        return orig_connect.call(this, destination, ...args);
    };

    // Returns the loudest RMS seen on any output tap so far. The running
    // maximum makes polling reliable: the poll only has to land once while
    // the (1-2.5 s) tone is sounding.
    probe.max_rms = function() {
        for (const analyser of probe.analysers) {
            const data = new Float32Array(analyser.fftSize);
            analyser.getFloatTimeDomainData(data);
            let sum_sq = 0;
            for (const value of data) {
                sum_sq += value * value;
            }
            const rms = Math.sqrt(sum_sq / data.length);
            if (rms > probe.max_rms_seen) {
                probe.max_rms_seen = rms;
            }
        }
        return probe.max_rms_seen;
    };

    const OrigAudioContext = window.AudioContext;
    window.AudioContext = class extends OrigAudioContext {
        constructor(...args) {
            super(...args);
            probe.contexts.push(this);
        }
    };
    if (window.webkitAudioContext !== undefined) {
        window.webkitAudioContext = window.AudioContext;
    }

    const orig_play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(...args) {
        probe.media_plays++;
        return orig_play.apply(this, args);
    };
}

export const test = base.extend({
    page: async ({ page }, use) => {
        const page_errors = [];
        page.on("pageerror", (error) => page_errors.push(error));
        await page.addInitScript(install_audio_probe);
        await use(page);
        expect(page_errors, "uncaught exceptions on the page").toEqual([]);
    },
});

// Loads the app and waits for initialization to finish (the play button
// starts out deactivated and is activated at the end of the init path).
export async function goto_app(page) {
    await page.goto("/");
    await expect(page.locator("#play-button")).not.toHaveClass(/deactivated/);
}

// Clicks play and waits until the app considers the audio played, which is
// when flag selection unlocks. _AUDIO_PLAYED flips duration * 0.8 (up to
// 2 s) after the click, and the first playback also waits for the piano
// samples to download, hence the generous timeout.
export async function play_and_wait(page) {
    await page.locator("#play-button").click();
    await page.waitForFunction("_AUDIO_PLAYED === true", null, { timeout: 15000 });
}

// The number of actual sound sources scheduled so far. The piano samples
// play through AudioBufferSourceNodes carrying multi-second sample buffers;
// Tone's silent control-signal nodes and feature-test sources are excluded.
export function audio_starts(page) {
    return page.evaluate(() => window.__audio_probe.starts.filter(
        (start) => start.type === "AudioBufferSourceNode" && !start.offline &&
            start.buffer_duration > 0.1).length);
}

export function max_rms(page) {
    return page.evaluate(() => window.__audio_probe.max_rms());
}

export function media_plays(page) {
    return page.evaluate(() => window.__audio_probe.media_plays);
}
