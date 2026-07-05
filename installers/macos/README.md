# macOS Installers

Expected artifacts for `v0.1.0`:

- `PrintPilot_0.1.0_aarch64.dmg` — Apple Silicon (M-series)
- `PrintPilot_0.1.0_x64.dmg` — Intel

These are **not built here** because a macOS `.dmg` cannot be produced on Linux —
it requires macOS's `hdiutil`, the macOS SDK, and (for distribution) codesign +
notarization, none of which exist off a Mac. They are produced by the
[`Release` workflow](../../.github/workflows/release.yml) on a `macos-latest` runner,
which builds both architectures.

## How to get them

1. Push a version tag: `git tag v0.1.0 && git push origin v0.1.0`
   (or run the **Release** workflow manually from the Actions tab).
2. Download the `.dmg` files from the resulting draft GitHub Release.
3. (Optional) Copy them into this folder to track them in-repo.

The app targets macOS 10.13+ (`minimumSystemVersion` in `tauri.conf.json`).

> The DMGs from CI are **unsigned**. On first launch macOS Gatekeeper will warn;
> right-click → Open, or run `xattr -dr com.apple.quarantine /Applications/PrintPilot.app`.
> For public distribution, add an Apple Developer ID signing identity +
> notarization to the workflow.
