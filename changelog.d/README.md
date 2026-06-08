# changelog.d

Drop one `.md` file here per user-visible change. Each file becomes a single
bullet point in the changelog. File names don't matter — entries are sorted
alphabetically before being compiled.

Write in plain English from the user's perspective. Good:

    Added option to skip single-note trainer when you answer incorrectly.

Bad:

    Refactored `should_load_single_note_trainer` to accept a correctness flag.

Run `make release` to compile these into `_data/changelog.yml` and `NEWS.md`,
then rebuild the site. The files in this directory are deleted after compilation.
