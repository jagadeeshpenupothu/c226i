# macOS Support

PrintPilot is currently distributed as unsigned macOS DMGs built from the Tauri application. Support claims are split into configured support and verified support.

## Summary

- Product version: `0.1.0`.
- Configured minimum macOS: `10.13`, from `src-tauri/tauri.conf.json`.
- Built binary deployment target: `10.13`, verified on the local Intel build with `otool -l`.
- Verified local runtime: macOS `12.7.6` on Intel `x86_64`.
- Intel target: `x86_64-apple-darwin`.
- Apple Silicon target: `aarch64-apple-darwin`.
- Universal target: script exists as `npm run tauri:build:mac`, but universal output is not verified.
- Signing/notarization: not configured.

## Configured Versus Verified Minimum

`bundle.macOS.minimumSystemVersion` is set to `10.13`. Tauri v2 also documents `10.13` as the default macOS bundle minimum. The local Intel artifact includes `LSMinimumSystemVersion = 10.13` and an `LC_VERSION_MIN_MACOSX` load command of `10.13`.

That does not prove runtime compatibility on every older macOS release. The current frontend build target is Safari 13 for macOS builds, so the realistic runtime floor needs older-device testing before the app claims true macOS 10.13 support.

Current status:

| Category | Status |
|---|---|
| Configured minimum | macOS 10.13 |
| Binary load command | macOS 10.13 |
| Verified runtime minimum | macOS 12.7.6 Intel |
| macOS 10.13-11.x runtime | Not verified |
| Apple Silicon runtime | Not verified in this session |

## Architecture Strategy

The release workflow builds separate DMGs:

- `PrintPilot-0.1.0-macos-x86_64.dmg` on an Intel macOS runner.
- `PrintPilot-0.1.0-macos-aarch64.dmg` on an Apple Silicon macOS runner.

Separate architecture artifacts are the release path until a universal build is actually produced and inspected.

## Local Intel Verification

Verified on this machine:

- Host: Intel `x86_64`.
- OS: macOS `12.7.6`.
- App bundle: `src-tauri/target/x86_64-apple-darwin/release/bundle/macos/PrintPilot.app`.
- DMG: `src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/PrintPilot_0.1.0_x64.dmg`.
- Executable: Mach-O 64-bit `x86_64`.
- Code signing: not signed.
- DMG mount: verified read-only; contains `PrintPilot.app`.
- Launch smoke test: process started and stayed running until manually stopped.

## Build Commands

```bash
npm run lint
npx tsc --noEmit
npx vite build --outDir /private/tmp/printpilot-vite-release-dist --emptyOutDir
cd src-tauri && cargo test && cargo check
cd ..
npm run tauri -- build --target x86_64-apple-darwin
```

Apple Silicon should be built natively on an arm64 macOS runner or an Apple Silicon Mac:

```bash
npm run tauri -- build --target aarch64-apple-darwin
```

Universal builds are not release-approved until verified:

```bash
npm run tauri:build:mac
```

## Unsigned Test Releases

Current DMGs are unsigned and unnotarized. Gatekeeper warnings are expected.

For local test installs, open the DMG, copy `PrintPilot.app` to `/Applications`, then right-click the app and choose `Open`. Do not disable Gatekeeper globally.

## Release Workflow

The GitHub Actions `Release` workflow:

- runs only for `v*` tags and manual dispatch;
- uses `npm ci` with `package-lock.json`;
- uses `cargo test --locked` and `cargo check --locked`;
- builds Intel and Apple Silicon DMGs on separate macOS runners;
- verifies executable architecture;
- mounts the DMG and checks for `PrintPilot.app`;
- generates SHA-256 checksum files;
- uploads workflow artifacts;
- attaches DMGs and checksums to a draft GitHub Release for tag builds.

## Known macOS Release Limitations

- Signing and notarization are not configured.
- Apple Silicon DMG output still needs a successful GitHub Actions run or Mac mini M4 build.
- Universal DMG output is unverified.
- Runtime compatibility below macOS 12.7.6 is not proven.
- Tauri warns that the bundle identifier `com.printpilot.app` ends in `.app`, which is not recommended for macOS bundle identifiers.

## Sources

- Tauri v2 configuration reference: `bundle.macOS.minimumSystemVersion` defaults to `10.13`.
- GitHub Actions hosted runner reference: current macOS Intel labels include `macos-15-intel`; current macOS arm64 labels include `macos-15`.
