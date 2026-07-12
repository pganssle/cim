# The Android app

The website is installable as a PWA, but a PWA's offline availability depends
on the browser's service worker cache, and browsers are allowed to evict that
cache more or less whenever they feel like it — which is a problem when you
want to run a training session somewhere with no signal. The Android app
exists to fix that: it is the same application, but with the built site
bundled *inside* the APK, so nothing about it can expire.

## How it works

The app is a thin [Capacitor](https://capacitorjs.com/) wrapper around the
Jekyll build output:

1. `make html` builds the site into `_site/`, exactly as for the website.
2. `npx cap sync android` copies `_site/` into
   `android/app/src/main/assets/public/` (configured via `webDir` in
   `capacitor.config.json`).
3. The native project in `android/` builds an APK whose single activity is a
   WebView. Capacitor serves the bundled files from an internal handler at
   `https://localhost`.

Because `https://localhost` is a secure origin, `fetch()` works and Tone.js
can load the piano samples normally — no special-casing of the audio code.
(An earlier attempt at this wrapper loaded the site via
`file:///android_asset/...`, where `fetch()` is blocked; that's what forced
the pre-generated-audio workarounds on the old `add-android-app` branch, none
of which are needed here.)

There is deliberately no service worker in the app: everything is already
local, so there is nothing to cache, and a cache-first worker could serve
stale files across app updates. `js/cim.js` skips registration when
`window.Capacitor` is present. The same check adds a `capacitor-app` class to
`<html>`, which the site stylesheet uses for app-specific layout tweaks. One
Jekyll build serves both platforms; there is no
`JEKYLL_ENV=android`.

### What's committed vs. generated

The `android/` directory is never committed. It is regenerated at build time
by `scripts/generate_android_project.sh` (via `make android-project`), which
is a deterministic function of three committed inputs:

- `package-lock.json` — pins `@capacitor/cli` exactly, and the native
  project template ships *inside* that npm package, so the lockfile
  transitively pins the generated project too.
- `patches/android/*.patch` — our edits to generated files, one patch per
  file: the signing/versioning wiring in `app/build.gradle`, the
  keep-screen-on flag in `MainActivity.java`, and the solid-color launch
  background in `styles.xml`. Everything in a patch is by definition ours;
  everything else is the template's.
- `scripts/generate_android_resources.sh` — derives the density-specific
  launcher icons from `assets/images/cim_logo_512.png` and the native splash
  color from `_data/theme.json`. The same JSON value is injected into the
  site's SCSS, so the web and native backgrounds cannot drift independently.

A stamp file (`android/.generated`) makes this incremental: `make` only
regenerates the project when one of those inputs changes, so routine builds
don't touch `android/` (or Gradle's incremental state inside it) at all.

Generating the launcher images requires ImageMagick's `magick` command. They
are written only into the ignored native project and are rebuilt whenever the
source logo or generator changes.

To change something in the native project: `make android-project`, edit the
files under `android/` directly (Android Studio works fine — the project
just isn't tracked), then `make android-patches` to capture your edits back
into `patches/android/`. To patch a file that isn't patched yet, add its
path to the list in `scripts/update_android_patches.sh` first.

Version information isn't committed either: `versionName`/`versionCode` are
passed to Gradle as `-PcimVersionName`/`-PcimVersionCode` (in CI, derived
from the git tag). Local builds default to `dev`/`1`.

## Building locally

You need Node ≥ 22, a JDK supported by the pinned Gradle version (JDK 21 is
the recommended choice; JDK 21–24 are supported), and the Android SDK. The
path of least
resistance for the SDK is installing [Android
Studio](https://developer.android.com/studio); if you'd rather not, the
command-line tools package works too — just make sure `ANDROID_HOME` points
at the SDK. Gradle itself comes from the wrapper inside the generated
project, so it doesn't need to be installed.

```bash
make apk-debug
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

`make apk-debug` chains the whole pipeline: Jekyll build → `npm ci` →
generate `android/` → `cap sync` → `gradlew assembleDebug`. Alternatively,
run `make android-assets` and then open `android/` in Android Studio and hit
Run, which also gets you an emulator.

Debug builds are signed with the auto-generated debug keystore, which is a
*different* certificate from release builds — Android won't install one over
the other, so uninstall first when switching between a debug build and a
released APK.

To debug the running app, open `chrome://inspect` in desktop Chrome with the
device connected over adb; the WebView shows up as an inspectable target with
the full DevTools.

## Cutting a release

Releases are built by `.github/workflows/android.yml`:

```bash
git tag v1.2.3
git push origin v1.2.3
```

That builds a signed APK and attaches it as `cim-v1.2.3.apk` to a GitHub
Release for the tag. Sideload it directly, or point an F-Droid-style updater
at the releases page.

`versionCode` (what Android actually compares for upgrades) is computed as
`major * 10000 + minor * 100 + patch`, so `v1.2.3` → `10203`. Two
consequences: minor and patch must stay below 100, and tags must be cut in
increasing version order or devices will refuse the "downgrade".

The `workflow_dispatch` trigger builds the same signed APK but only uploads
it as a workflow artifact, which is useful for testing the pipeline without
publishing anything.

## Signing keys and secrets

The workflow signs with a keystore stored in four repository secrets:

| Secret | Contents |
|---|---|
| `KEYSTORE_BASE64` | the `.jks` keystore file, base64-encoded |
| `KEYSTORE_PASSWORD` | keystore password |
| `KEY_ALIAS` | key alias (`cim` below) |
| `KEY_PASSWORD` | key password (often the same as the keystore password) |

Initial setup:

```bash
keytool -genkeypair -v -keystore cim-release.jks \
  -alias cim -keyalg RSA -keysize 4096 -validity 25000 \
  -dname "CN=Paul Ganssle, OU=CIM, O=ganbar.us"

base64 -w0 cim-release.jks | gh secret set KEYSTORE_BASE64
gh secret set KEYSTORE_PASSWORD
gh secret set KEY_ALIAS --body cim
gh secret set KEY_PASSWORD
```

The same `gh secret set` commands rotate a secret later (e.g. if you need to
re-encode the keystore or change its password).

Keep the keystore file somewhere safe *outside* the repository, and back it
up somewhere that isn't GitHub. Android identifies an app by its signing
certificate: if the keystore is lost, a new one can't produce updates that
existing installs will accept — every device would have to uninstall and
reinstall, losing its local training data. There is no recovery path;
Google's Play App Signing exists precisely because people kept losing these,
but sideloaded apps don't get that safety net.

## Updating Capacitor

```bash
npm install @capacitor/core@latest @capacitor/cli@latest @capacitor/android@latest
make apk-debug
```

The lockfile change invalidates the stamp, so the next build regenerates
`android/` from the new template. If the new template changed a file we
patch, `git apply` fails loudly at that point; fix it by regenerating the
patch against the new template (`make android-project` up to the failure,
re-apply your edit by hand, `make android-patches`). Major-version updates
sometimes want other changes too (JDK/AGP bumps) — check the [Capacitor
upgrade guide](https://capacitorjs.com/docs/updating/8-0) for the target
version.
