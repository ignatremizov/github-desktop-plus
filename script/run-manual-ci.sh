#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: script/run-manual-ci.sh [options]

Manually verify the fork on macOS, optionally producing an installable ZIP.
Build mode runs all verification before uploading. Nothing is installed locally.

  --mode verify|build  Verify only or also upload the app (default: build)
  --arch x64|arm64     Native macOS architecture (default: x64)
  --repo OWNER/REPO    Repository (default: this checkout's origin)
  --ref BRANCH        Published branch (default: current branch)
  --run ID            Resume watching an existing manual run for this revision
  -h, --help          Show help

MANUAL_CI_POLL_SECONDS controls the watch interval (default: 60).
Commit and push first: the helper rejects unpublished or dirty current-branch work.
EOF
}

mode=build
arch=x64
repo=''
ref=''
run_id=''
poll_seconds="${MANUAL_CI_POLL_SECONDS:-60}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --mode|--arch|--repo|--ref|--run)
      if [[ $# -lt 2 || -z "$2" || "$2" == --* ]]; then
        echo "Missing value for $1" >&2
        exit 2
      fi
      case "$1" in
        --mode) mode="$2" ;;
        --arch) arch="$2" ;;
        --repo) repo="$2" ;;
        --ref) ref="$2" ;;
        --run) run_id="$2" ;;
      esac
      shift 2
      ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

[[ "$mode" == verify || "$mode" == build ]] || { echo "Invalid mode: $mode" >&2; exit 2; }
[[ "$arch" == x64 || "$arch" == arm64 ]] || { echo "Invalid architecture: $arch" >&2; exit 2; }
[[ "$poll_seconds" =~ ^[1-9][0-9]*$ ]] || { echo "Invalid poll interval" >&2; exit 2; }
[[ -z "$run_id" || "$run_id" =~ ^[1-9][0-9]*$ ]] || { echo "Invalid run ID" >&2; exit 2; }

for required_command in git gh jq; do
  command -v "$required_command" >/dev/null || { echo "Missing $required_command" >&2; exit 2; }
done

cd "$(git rev-parse --show-toplevel)"
if [[ -z "$repo" ]]; then
  origin_url="$(git remote get-url origin)"
  repo="${origin_url#git@github.com:}"
  repo="${repo#https://github.com/}"
  repo="${repo%.git}"
fi
[[ "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "Pass --repo OWNER/REPO for this remote" >&2; exit 2; }
current_branch="$(git branch --show-current)"
ref="${ref:-$current_branch}"
[[ -n "$ref" ]] || { echo "Detached HEAD: pass --ref" >&2; exit 2; }
head_sha="$(gh api "repos/$repo/commits/$ref" --jq .sha)"
if [[ "$ref" == "$current_branch" ]]; then
  [[ "$(git rev-parse HEAD)" == "$head_sha" ]] || { echo "Local and remote revisions differ; push first." >&2; exit 2; }
  [[ -z "$(git status --porcelain)" ]] || { echo "Worktree is dirty; commit and push first." >&2; exit 2; }
fi

if [[ -z "$run_id" ]]; then
  request_id="$(date -u +%Y%m%dT%H%M%SZ)-$$-$RANDOM"
  title="macOS $mode $arch [$request_id]"
  gh workflow run ci.yml --repo "$repo" --ref "$ref" \
    -f "mode=$mode" -f "arch=$arch" -f "request_id=$request_id"
  for ((attempt = 0; attempt < 30; attempt++)); do
    run_id="$(gh run list --repo "$repo" --workflow ci.yml --event workflow_dispatch \
      --branch "$ref" --limit 30 --json databaseId,headSha,displayTitle |
      jq -r --arg sha "$head_sha" --arg title "$title" \
        '[.[] | select(.headSha == $sha and .displayTitle == $title)][0].databaseId // empty')"
    [[ -n "$run_id" ]] && break
    sleep 2
  done
  [[ -n "$run_id" ]] || { echo "Dispatched, but could not locate run [$request_id]. Check Actions before retrying." >&2; exit 1; }
fi

run_json="$(gh api "repos/$repo/actions/runs/$run_id")"
if ! jq -e --arg sha "$head_sha" --arg repo "$repo" --arg ref "$ref" \
  --arg prefix "macOS $mode $arch [" \
  '.head_sha == $sha and .head_repository.full_name == $repo and
   .head_branch == $ref and .event == "workflow_dispatch" and
   .path == ".github/workflows/ci.yml" and (.display_title | startswith($prefix))' \
  <<<"$run_json" >/dev/null; then
  echo "Run $run_id is not the requested manual $mode/$arch run for $repo:$ref ($head_sha)." >&2
  exit 2
fi

echo "Source: $head_sha"
echo "Watching: https://github.com/$repo/actions/runs/$run_id"
if ! gh run watch "$run_id" --repo "$repo" --interval "$poll_seconds" --exit-status; then
  gh run view "$run_id" --repo "$repo" --log-failed >&2 || true
  exit 1
fi

if [[ "$mode" == build ]]; then
  artifact_name="GitHubDesktopPlus-macOS-$arch-$head_sha"
  artifact_id="$(gh api "repos/$repo/actions/runs/$run_id/artifacts" \
    --jq ".artifacts[] | select(.name == \"$artifact_name\" and .expired == false) | .id")"
  [[ -n "$artifact_id" ]] || { echo "Build passed but its expected artifact is missing." >&2; exit 1; }
  echo "Artifact: https://github.com/$repo/actions/runs/$run_id/artifacts/$artifact_id"
  echo "Download: gh run download $run_id --repo $repo --name $artifact_name"
fi
