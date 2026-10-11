#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
arch="${TARGET_ARCH:-$(node -p process.arch)}"
version="${APP_VERSION:-$(node -p "require('./app/package.json').version")}"
app_bundle="$PWD/dist/GitHub Desktop Plus-darwin-$arch/GitHub Desktop Plus.app"
app_binary="$app_bundle/Contents/MacOS/GitHub Desktop Plus"
resources="$app_bundle/Contents/Resources/app"
plist="$app_bundle/Contents/Info.plist"

[[ "$(uname -s)" == Darwin ]] || { echo "This check requires macOS." >&2; exit 1; }
[[ -d "$app_bundle" ]] || { echo "Missing application: $app_bundle" >&2; exit 1; }
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")" == "$version" ]]
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist")" == \
  "$(node -p "require('./app/package.json').bundleID")" ]]
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$plist")" == 'GitHub Desktop Plus' ]]
codesign --verify --deep --strict --verbose=2 "$app_bundle"

# A bundle must remain usable after leaving the runner's checkout.
while IFS= read -r -d '' link; do
  target="$(readlink "$link")"
  [[ "$target" != /* && -e "$link" ]] || { echo "Non-portable or broken symlink: $link -> $target" >&2; exit 1; }
done < <(find "$app_bundle" -type l -print0)

runtime_arch="$(ELECTRON_RUN_AS_NODE=1 "$app_binary" -p process.arch)"
[[ "$runtime_arch" == "$arch" ]] || { echo "Wrong runtime architecture: $runtime_arch" >&2; exit 1; }
"$resources/git/bin/git" --version
# Dugite sets this for every invocation; the embedded Git's compiled-in path
# points at /libexec/git-core, not at this relocatable application bundle.
GIT_EXEC_PATH="$resources/git/libexec/git-core" \
  GIT_CONFIG_NOSYSTEM=1 GIT_TERMINAL_PROMPT=0 \
  "$resources/git/bin/git" -c credential.helper= \
  ls-remote https://github.com/desktop-plus/desktop-plus.git HEAD
echo "Verified $version ($arch): identity, signature, portable symlinks, Electron runtime, and Git HTTPS."
