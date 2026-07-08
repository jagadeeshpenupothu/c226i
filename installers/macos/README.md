# macOS DMG Installers

PrintPilot macOS DMGs are produced by the GitHub Actions `Release` workflow and are intended to be downloaded from workflow artifacts or draft GitHub Releases. Do not commit generated DMG binaries to normal git history.

## Current Artifacts

For version `0.1.0`, the workflow emits:

- `PrintPilot-0.1.0-macos-x86_64.dmg` for Intel Macs.
- `PrintPilot-0.1.0-macos-aarch64.dmg` for Apple Silicon Macs.
- `PrintPilot-0.1.0-macos-*.dmg.sha256` checksum files.

The local verified Intel build also produced Tauri's default DMG name:

- `src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/PrintPilot_0.1.0_x64.dmg`

That path is inside `src-tauri/target`, which is ignored.

## Compatibility Status

- Configured minimum macOS: `10.13`, from `bundle.macOS.minimumSystemVersion`.
- Built binary minimum load command: `10.13`, verified on the local Intel build with `otool -l`.
- Verified runtime minimum: macOS `12.7.6` on Intel `x86_64`.
- Frontend target: Safari 13 for macOS builds, from `vite.config.ts`.
- Apple Silicon runtime: not locally verified in this repository session.

The configured minimum and Mach-O deployment target are not the same as a fully verified runtime support floor. Older macOS versions still need real device testing before support is advertised as proven.

## Local Intel Build

On an Intel Mac with dependencies installed:

```bash
npm ci
npm run lint
npx tsc --noEmit
npx vite build --outDir /private/tmp/printpilot-vite-release-dist --emptyOutDir
cd src-tauri && cargo test && cargo check
cd ..
npm run tauri -- build --target x86_64-apple-darwin
```

If `hdiutil` fails under a restricted sandbox with `Device not configured`, rerun the DMG creation outside the sandbox. The app bundle can still be created successfully before the DMG step.

## GitHub Actions Release

Use the `Release` workflow:

1. Run it manually from the GitHub Actions tab to verify both macOS jobs and download workflow artifacts.
2. After approval, create and push a version tag such as `v0.1.0`.
3. The workflow builds Intel and Apple Silicon DMGs on separate macOS runners, verifies architecture and DMG contents, writes SHA-256 checksum files, and attaches the DMGs to a draft GitHub Release.

Do not create or push tags until the release is approved.

## Unsigned App Notes

The current DMGs are unsigned and unnotarized. macOS Gatekeeper will warn on first launch.

Safe local testing flow:

1. Download the DMG from GitHub.
2. Open the DMG.
3. Drag `PrintPilot.app` to `/Applications`.
4. In Finder, right-click `PrintPilot.app` and choose `Open`.
5. Confirm the warning for this app only.

Do not disable Gatekeeper globally.

## Verification Commands

```bash
file PrintPilot.app/Contents/MacOS/printpilot
lipo -info PrintPilot.app/Contents/MacOS/printpilot
otool -l PrintPilot.app/Contents/MacOS/printpilot | grep -A 4 LC_VERSION_MIN_MACOSX
codesign -dv --verbose=4 PrintPilot.app
shasum -a 256 PrintPilot-0.1.0-macos-x86_64.dmg
hdiutil attach -readonly -nobrowse PrintPilot-0.1.0-macos-x86_64.dmg
hdiutil detach /Volumes/PrintPilot_0.1.0_x64
```

## Known Limitations

- Apple Silicon DMG generation is configured for GitHub-hosted arm64 macOS runners but is not locally verified on the Intel MacBook Pro.
- Universal DMG generation remains unverified. Keep separate architecture DMGs until a universal build is successfully produced and inspected.
- Signing and notarization are not configured.
- The bundle identifier remains `com.printpilot.app`; Tauri warns that identifiers ending in `.app` are not recommended for macOS.
