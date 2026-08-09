<!-- markdownlint-disable MD013 -->

# GitHub Desktop Plus Fork Ledger

This file is the maintenance map for behavior carried by `fork` but not by `upstream/main`. It is not a changelog. Keep one row per maintained capability and update that row when the capability changes, moves, lands upstream, or is retired.

The intended branch relationship is:

```text
upstream/main
    └── fork       all maintained downstream behavior
```

Use `git log --reverse upstream/main..fork` to inspect the current fork stack. Exact commit subjects are the stable semantic anchors for each capability; unlike short SHAs, they do not need to be refreshed after a history rewrite.

The package, executable, profile, and credential-storage identity remains GitHub Desktop Plus for compatibility. The renderer may present the fork-specific display name, Ignat's GitHub Desktop Plus, without changing those persistent identifiers.

## Classification

| Kind | Meaning |
| --- | --- |
| Compatibility | Restores or preserves preferred behavior that upstream removed or changed. |
| Capability | Adds user-visible behavior not present upstream. |
| Development | Isolates or improves local development without changing production behavior. |
| Documentation | Maintains review fixtures or design guidance for a fork capability. |
| Branding | Identifies the fork while preserving compatible package and storage identifiers. |
| Release | Versions and packages the maintained fork. |

## Maintained Capabilities

| Capability | Kind | Purpose | Primary fork entrypoints | Required upstream seams | Commits |
| --- | --- | --- | --- | --- | --- |
| Stable repository filtering and scroll ownership | Compatibility | Preserve filtered row order, rank visible repository, branch, and path matches predictably, and keep the outer repository list as the only scroll owner. | `app/src/ui/lib/section-filter-list.tsx`<br>`app/src/ui/lib/list/section-list.tsx`<br>`app/src/ui/repositories-list/`<br>`app/styles/ui/_list.scss`<br>`app/styles/ui/_repository-list.scss` | Virtualized section rendering, repository-list filtering, row highlighting, and list layout | `fix(list): preserve filtered order and prevent nested scrollbars`, `fix(worktrees): rank sidebar filter matches visibly`, `fix(list): prevent nested section scrollbars` |
| Worktree-family sidebar and path-aware Recent entries | Compatibility | Restore main/linked worktree families on the current persisted repository model, retain migrated and temporarily missing linked rows, route row actions to the represented path, and remember the selected worktree in configurable Recent entries. | `app/src/ui/repositories-list/group-repositories.ts`<br>`app/src/ui/repositories-list/repositories-list.tsx`<br>`app/src/ui/repositories-list/repository-list-item.tsx`<br>`app/src/lib/stores/app-store.ts`<br>`app/src/lib/stores/repositories-store.ts`<br>`app/src/lib/git/worktree.ts` | Git worktree discovery, saved-repository state, repository list grouping, row actions, Recent persistence, and Appearance preferences | `fix(worktrees): update sidebar state and recent settings`, `fix(worktrees): derive sidebar rows from worktree families`, `fix(worktrees): wire sidebar worktree row interactions`, `fix(worktrees): keep migrated linked rows in sidebar families`, `fix(worktrees): preserve saved linked rows before missing-state refresh` |
| Multi-commit diff totals | Capability | Show aggregate changed-file and line totals when history review selects more than one commit. | `app/src/ui/history/expandable-commit-summary.tsx` | History selection summaries and multi-commit diff metadata | `fix(history): show diff totals for multi-commit selections` |
| Compatible fork identity and distinct display name | Branding | Package and store data as GitHub Desktop Plus while presenting Ignat's GitHub Desktop Plus in user-facing copy, including native window titles, without migrating config, keychain, executable, or installer identities. | `app/package.json`<br>`app/app-info.ts`<br>`app/src/ui/lib/app-proxy.ts`<br>`app/src/main-process/migrate-config-dir.ts`<br>`script/`<br>`publish/`<br>`.github/workflows/ci.yml` | Product metadata, compile-time app-name replacement, profile migration, packaging, icons, launchers, workflows, and user-facing labels | `fix(branding): restore GitHub Desktop Plus identity`, `fix(branding): add fork display name` |
| Isolated development credentials | Development | Let local development runners use a separate keychain service while ensuring production builds always use the normal GitHub Desktop Plus credential identity. | `app/src/lib/auth.ts` | Build-mode globals and keychain account-name construction | `fix(auth): isolate development keychain override` |
| Markdown word-boundary diff wrapping and review fixture | Compatibility | Keep wrapped Markdown prose readable without changing long-token behavior for code, JSON, logs, or plain text, and retain a generic two-commit fixture that demonstrates wrapped and unwrapped behavior. | `app/src/ui/diff/side-by-side-diff.tsx`<br>`app/src/ui/lib/diff-mode.tsx`<br>`app/styles/ui/_side-by-side-diff.scss`<br>`docs/diff-line-wrapping-demo.md` | Diff wrapping preference, per-file row classes, and Markdown styling | `fix(diff): preserve word boundaries in Markdown diffs`, `docs(demo): add diff line wrapping showcase`, `docs(demo): create long-line wrapping comparison` |
| Optional semantic line and intraline diff alignment | Capability | Offer an opt-in enhanced renderer that aligns related replacement lines, distinguishes genuine insertions, preserves useful shared syntax, and keeps the standard Git-oriented renderer available as the default fallback. | `app/src/ui/diff/changed-range.ts`<br>`app/src/ui/diff/diff-line-alignment.ts`<br>`app/src/ui/diff/modified-diff-rows.ts`<br>`app/src/ui/diff/diff-options.tsx`<br>`app/src/ui/diff/diff-presentation-state.ts`<br>`docs/technical/smart-diff.md` | Diff row construction, syntax tokens, unified/split presentation, staging identities, persisted preferences, and every diff-view host | `feat(diff): add optional semantic line and intraline alignment` |
| Customizable commit-summary expansion shortcut | Capability | Expand or collapse long history commit messages through a recorded shortcut regardless of focus, with conflict detection and reliable synchronization across windows. | `app/src/lib/commit-details.ts`<br>`app/src/lib/ipc-shared.ts`<br>`app/src/ui/history/selected-commits.tsx`<br>`app/src/ui/preferences/keyboard.tsx` | History summary state, global key handling, Preferences models, app-store persistence, and renderer/main-process IPC | `feat(history): add customizable commit summary expansion shortcut` |
| Large SVG image diffs and intrinsic sizing | Capability | Render SVG revisions as scalable image comparisons beyond text-renderer limits, defer only genuinely oversized buffers, preserve conflicted SVG text review, and derive safe intrinsic dimensions. | `app/src/lib/git/diff.ts`<br>`app/src/models/diff/diff-data.ts`<br>`app/src/models/diff/image.ts`<br>`app/src/ui/diff/image-diffs/svg.ts`<br>`app/src/ui/diff/image-diffs/sizing.ts` | Git diff classification and limits, image-diff models, SVG sanitization, partial-diff handling, and diff routing | `fix(diff): support SVG rendering for large diffs and intrinsic sizing` |
| Interactive image-diff zooming and panning | Capability | Inspect large raster and SVG revisions with fixed zoom controls, pointer-centered modified-wheel zoom, two-dimensional scrolling, and drag panning while keeping Swipe and Onion Skin controls accessible. | `app/src/ui/diff/image-diffs/modified-image-diff.tsx`<br>`app/src/ui/diff/image-diffs/image-container.tsx`<br>`app/src/ui/diff/image-diffs/swipe.tsx`<br>`app/src/ui/diff/image-diffs/onion-skin.tsx`<br>`app/styles/ui/_diff.scss` | Image comparison mode layout, viewport ownership, pointer capture, responsive controls, and rendered image sizing | `feat(diff): add interactive zoom controls, wheel zoom, and 2D scroll panning for image diffs` |
| Fork release version | Release | Keep locally packaged fork installers above the upstream 3.x release line while retaining compatible GitHub Desktop Plus package and launcher identities. | `app/package.json` | Upstream package version and release packaging | `chore(release): bump fork package version to 4.0.0` |

## Update Protocol

- Fetch `upstream/main` and compare `upstream/main..fork` after every upstream rebase.
- Add a row when new maintained behavior lands; amend an existing row when work extends the same capability.
- Update subject anchors only when a capability commit is reworded, split, or squashed.
- If upstream implements an equivalent capability, compare behavior and tests before removing the fork carry. Record whether it was dropped, narrowed, or deliberately retained.
- Preserve the package/config/keychain identity boundary when resolving upstream branding or packaging churn.
- Keep the two Markdown demonstration commits separate and ordered so their comparison remains a useful visual fixture.
- Keep tests, fixtures, paths, repository names, branches, and sample content generic and free of workspace or personal data.
- Keep the release-only version commit at the fork tip so capability commits remain reusable and reviewable against the upstream version.

## Review Checklist

Before declaring the ledger current:

1. `git log --reverse upstream/main..fork` has no unclassified behavior commit.
2. Every listed entrypoint still exists on `fork`.
3. Worktree grouping still covers loaded, missing, migrated, Recent, and ambiguous-family states without changing the persisted repository model.
4. Config-backed UI capabilities still persist correctly and synchronize across relevant windows and diff surfaces.
5. Standard and semantic diffs remain usable in unified and split layouts with wrapping enabled and disabled.
6. SVG and raster comparisons retain bounded loading, accurate sizing, fixed controls, zoom anchoring, and two-dimensional navigation.
7. Focused unit tests, source lint, TypeScript, diff checks, and the development package build pass.
8. The release-version commit is the final commit on `fork`.
