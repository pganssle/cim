#!/usr/bin/env node
// Update every committed copy of the current stable Android version.
import fs from "node:fs";

const [versionName, versionCodeText] = process.argv.slice(2);
const versionCode = Number(versionCodeText);
if (!/^\d{4}\.\d{2}\.\d+$/.test(versionName ?? "") ||
    !Number.isSafeInteger(versionCode)) {
  console.error(`usage: ${process.argv[1]} VERSION_NAME VERSION_CODE`);
  process.exit(2);
}

fs.writeFileSync(
  "android-version.json",
  `${JSON.stringify({versionName, versionCode}, null, 2)}\n`,
);

const metadataPath = "fdroid/metadata/us.ganbar.cim.yml";
let metadata = fs.readFileSync(metadataPath, "utf8");
metadata = metadata
  .replace(/^(  - versionName:) .+$/m, `$1 ${versionName}`)
  .replace(/^(    versionCode:) \d+$/m, `$1 ${versionCode}`)
  .replace(/^(    commit:) .+$/m, `$1 v${versionName}`)
  .replace(/^CurrentVersion: .+$/m, `CurrentVersion: ${versionName}`)
  .replace(/^CurrentVersionCode: \d+$/m, `CurrentVersionCode: ${versionCode}`);
fs.writeFileSync(metadataPath, metadata);
