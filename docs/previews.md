# Pull request previews

Every pull request gets a live preview of the built site at

    https://pganssle.github.io/cim-previews/pr-<number>/

deployed by `.github/workflows/preview.yml` and linked from a sticky
comment on the PR. The preview is updated on every push to the PR and
deleted when the PR closes.

Previews live in a separate repository ([cim-previews]) rather than on the
production Pages deployment for two reasons:

- The production site is deployed with the "GitHub Actions" Pages source,
  which cannot coexist with branch-based preview subdirectories in the
  same repository.
- localStorage is shared per origin. Keeping previews off the production
  origin means opening a preview cannot touch real training data
  (`cim_state` / `cim_session_history`).

The service worker does not run in previews: the app registers `../sw.js`,
which only resolves when the site is served from a domain root. That is
fine for previews (no cache-first worker to pollute the browser), and the
service worker behavior is covered by the end-to-end tests instead.

## Pull requests from forks

Fork PRs get previews too, but publishing one requires a manual approval
(under the run's "deploy" job) because the workflow runs on
`pull_request_target`, which has access to the deploy-key secret. The
privileges are split so that approval is about *publishing content*, not
about code execution:

- Only the build job executes PR code, with a read-only token and no
  secrets.
- Only the deploy job holds the deploy key, and it never executes PR
  code — it publishes the built artifact. For fork PRs it runs in the
  `preview-fork` environment, which requires review; same-repo PRs use
  the unprotected `preview` environment and deploy automatically.

Before approving, remember that the preview publishes the PR's HTML/JS on
the `pganssle.github.io` origin, which is shared with other project sites
(localStorage in particular), so give the diff a glance first.

[cim-previews]: https://github.com/pganssle/cim-previews

## One-time setup

1. Create the **public** `pganssle/cim-previews` repository with an
   initial commit containing a `.nojekyll` file at the root (the pushed
   content is already-built HTML; `.nojekyll` stops Pages from running it
   through Jekyll again).

2. Enable GitHub Pages on `cim-previews`: Settings → Pages → Source
   "Deploy from a branch", branch `main`, folder `/ (root)`.

3. Create a deploy key pair (no passphrase):

       ssh-keygen -t ed25519 -N "" -C "cim previews deploy" -f cim-previews-key

4. Add `cim-previews-key.pub` as a **deploy key with write access** on
   `cim-previews`: Settings → Deploy keys → Add deploy key → check
   "Allow write access".

5. Add the private key (`cim-previews-key`) as an Actions secret named
   `CIM_PREVIEWS_DEPLOY_KEY` on **this** repository: Settings → Secrets
   and variables → Actions → New repository secret.

6. Delete both local key files.

7. Create the protected environment for fork previews **before** this
   workflow lands on main (deploying to a nonexistent environment
   auto-creates it *without* protection): Settings → Environments → New
   environment → name it `preview-fork` → check "Required reviewers" and
   add yourself. The unprotected `preview` environment used by same-repo
   PRs is auto-created on first use and needs no setup.

To rotate the key, repeat steps 3-6.
