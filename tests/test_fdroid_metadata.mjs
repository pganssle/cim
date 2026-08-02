import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";

const version = JSON.parse(fs.readFileSync("android-version.json", "utf8"));
const changelog =
  `fastlane/metadata/android/en-US/changelogs/${version.versionCode}.txt`;
const metadata = fs.readFileSync(
  "fdroid/metadata/us.ganbar.cim.yml",
  "utf8",
);

function metadataValue(name) {
  const match = metadata.match(new RegExp(`^${name}: (.+)$`, "m"));
  assert(match, `missing ${name} in F-Droid metadata`);
  return match[1];
}

assert.match(version.versionName, /^\d{4}\.\d{2}\.\d+$/);
assert(Number.isSafeInteger(version.versionCode));
assert.equal(
  Number(childProcess.execFileSync(
    "./scripts/tag_android_version.sh",
    ["--version-code", version.versionName],
    {encoding: "utf8"},
  )),
  version.versionCode,
);
assert.equal(metadataValue("CurrentVersion"), version.versionName);
assert.equal(Number(metadataValue("CurrentVersionCode")), version.versionCode);
assert.equal(
  metadataValue("Binaries"),
  "https://github.com/pganssle/cim/releases/download/v%v/cim-v%v.apk",
);
assert.match(metadataValue("AllowedAPKSigningKeys"), /^[0-9a-f]{64}$/);

const build = metadata.match(
  /^  - versionName: (.+)\n    versionCode: (\d+)\n    commit: (.+)$/m,
);
assert(build, "missing current F-Droid build entry");
assert.equal(build[1], version.versionName);
assert.equal(Number(build[2]), version.versionCode);
assert.equal(build[3], `v${version.versionName}`);

for (const file of [
  "fastlane/metadata/android/en-US/short_description.txt",
  "fastlane/metadata/android/en-US/full_description.txt",
  "fastlane/metadata/android/en-US/images/icon.png",
  "fastlane/metadata/android/en-US/images/phoneScreenshots/01-blue-trainer.png",
  "fastlane/metadata/android/en-US/images/tenInchScreenshots/01-trainer.png",
  "fastlane/metadata/android/en-US/images/tenInchScreenshots/02-single-note-follow-on.png",
  "fastlane/metadata/android/en-US/images/tenInchScreenshots/03-music-trainer.png",
  "fastlane/metadata/android/en-US/images/tenInchScreenshots/04-statistics.png",
  changelog,
]) {
  assert(fs.statSync(file).size > 0, `${file} is missing or empty`);
}
assert(fs.readFileSync(changelog, "utf8").length <= 500,
  `${changelog} exceeds F-Droid's 500-character limit`);

console.log("F-Droid metadata is consistent with android-version.json");
