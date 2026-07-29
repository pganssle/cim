# Contributing

Thanks for contributing! This is a single-page Jekyll app with vanilla JavaScript and SCSS. Node is used for the automated tests and changelog tooling.

## Development setup

Requirements: Ruby (≥ 3.2), Bundler, and Node.js (≥ 22).

```sh
make init    # install Ruby gems into vendor/bundle
make serve   # start a local server with live reload at http://localhost:4000
make html    # one-shot build to _site/
```

The main files:

| File | Purpose |
|------|---------|
| `index.html` | Entire app UI; uses Jekyll Liquid for data injection |
| `js/cim.js` | All application logic |
| `_sass/_cim.scss` | All component styles |
| `_data/chords.yml` | Chord definitions |
| `_data/instruments.yml` | Instrument definitions |
| `NEWS.md` | Changelog displayed in the information modal |

## Making changes

- **JavaScript**: vanilla ES6+, no framework, no bundler. All state is stored in `localStorage` via the `STATE` object. Per-profile settings live inside profile objects; global settings live directly on `STATE`.
- **Styles**: SCSS compiled by Jekyll. Variables and theme tokens are in `_sass/_variables.scss` and `_sass/_theme.scss`.
- **Data**: chord and instrument configuration lives in `_data/`. Jekyll makes these available as `site.data.*` in Liquid templates.
- **Testing**: `make test` runs the Playwright suite, including changelog compilation coverage, in Chromium and Firefox.

## Adding a changelog entry

For any user-visible change, create a short `.md` file in `changelog.d/`:

```sh
echo "Added support for left-handed mode." > changelog.d/left-handed-mode.md
```

The file name doesn't matter. Write one entry per file, in plain English from the user's perspective. These are compiled into `NEWS.md` by `make release`.

## Making a release

`make release` compiles all pending `changelog.d/` entries and rebuilds the site:

```sh
make release
```

This runs `news-fragments`, which:

1. Reads all `*.md` files in `changelog.d/`.
2. Prepends a new dated block to `NEWS.md`.
3. Deletes the processed `changelog.d/*.md` files.

Then Jekyll rebuilds the site. `NEWS.md` is the single changelog source and is rendered directly into the information modal.

## Pull requests

- Target the `main` branch.
- Keep commits focused — one logical change per commit.
- If your change is user-visible, add a `changelog.d/` entry.
- Run `make html` to confirm the site builds without errors before opening a PR.
