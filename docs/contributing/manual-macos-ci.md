# Manual macOS verification and builds

The fork's existing **CI** workflow accepts manual `verify` and `build` modes.
Both use native macOS runners, compile the production app, run source checks and
unit/script tests, and verify the packaged app's signature, identity, architecture,
portable symlinks, and bundled Git HTTPS support. `build` also uploads an
installable ZIP, its SHA-256 checksum, and source/run metadata.

Commit and push the branch first, then run:

```sh
bash script/run-manual-ci.sh --mode verify
bash script/run-manual-ci.sh --mode build
```

The default architecture is `x64` for Intel Macs. Pass `--arch arm64` for Apple
Silicon. Both modes can also be dispatched from **Actions → CI → Run workflow**,
selecting the `fork` branch, or directly:

```sh
gh workflow run ci.yml --ref fork -f mode=build -f arch=x64
```

The helper uses the checkout's `origin`, checks that the current branch is clean
and pushed, identifies the dispatched run by a unique request ID and exact commit,
and waits with 60-second polls. To resume:

```sh
bash script/run-manual-ci.sh --mode build --arch x64 --run RUN_ID
```

It exits nonzero on failure and prints failed logs. It never automatically
redispatches failed tests, builds another revision, installs an app, or publishes a
release. `--repo OWNER/REPO` and `--ref BRANCH` select another published branch.

## Artifacts and installation

The helper prints the artifact URL and download command on success. The artifact
name includes the architecture and full source commit. `build-info.json` records
the package version, source commit, producing workflow, and signing policy.
After downloading, run `shasum -a 256 -c SHA256SUMS` in the artifact directory.
Extract the inner application ZIP with `ditto -x -k` to preserve the macOS bundle.

The version comes from `app/package.json`, not the ordinary non-tag CI placeholder
`0.0.0`. These are optimized personal builds, ad-hoc signed and **not notarized**.
The empty, non-publishing release channel matches ordinary CI; `build:prod`
still sets `NODE_ENV=production`, so the production profile, credential naming,
app name, and bundle identifier are retained. No Apple release credentials are
needed. Gatekeeper may require explicit user approval for a downloaded app.

Before replacing an existing installation, quit the app and back up both the
application and `~/Library/Application Support/GitHub Desktop Plus`. Keep those
backups until launch, accounts, and repositories have been checked. The older
Pol Rivero app has a different bundle identifier, so keychain access or default
URL-handler selection may need confirmation. Do not delete the profile or clear
the keychain to address an installation prompt.

Existing automatic and reusable CI behavior is unchanged. A manual dispatch runs
only the selected macOS job, not the Windows/Linux matrices. The workflow does
not update the fork from upstream or restore local-only capability changes.
