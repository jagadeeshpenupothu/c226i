# macOS Support

PrintPilot targets the widest macOS range that Tauri v2 allows. This document lists exactly which macOS versions and Mac hardware are supported.

## Summary

- **Minimum:** macOS 10.13 (High Sierra) — set via `bundle.macOS.minimumSystemVersion` in [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json).
- **Architectures:** Intel (`x86_64`) and Apple Silicon (`arm64`) via a universal binary.
- **Latest tested target:** macOS 26 (Tahoe), the current release.
- **Forward compatible:** runs on future Apple Silicon releases (e.g. macOS 27).

10.13 is the lowest version Tauri v2 supports, so this reaches essentially every Mac laptop still in real-world use. Printing uses the native CUPS backend (`lp`/`lpstat`/`lpoptions`), not the browser `window.print` API, so the 10.13 floor is safe.

## Supported macOS versions

| # | Version | Name | Year | Runs on |
|---|---------|------|------|---------|
| 1 | 10.13 | High Sierra | 2017 | Intel |
| 2 | 10.14 | Mojave | 2018 | Intel |
| 3 | 10.15 | Catalina | 2019 | Intel |
| 4 | 11 | Big Sur | 2020 | Intel + Apple Silicon¹ |
| 5 | 12 | Monterey | 2021 | Intel + Apple Silicon |
| 6 | 13 | Ventura | 2022 | Intel + Apple Silicon |
| 7 | 14 | Sonoma | 2023 | Intel + Apple Silicon |
| 8 | 15 | Sequoia | 2024 | Intel + Apple Silicon |
| 9 | 26 | Tahoe | 2025 | Intel + Apple Silicon — **current latest** |

¹ Big Sur (11) was the first macOS to run on Apple Silicon.

That is **9 released major versions** of coverage.

## Architecture details

- **Intel Macs** run the `x86_64` slice, valid from 10.13 up to macOS 26 (Tahoe).
- **Apple Silicon Macs (M1–M4 and later)** run the `arm64` slice. These devices all ship with macOS 11+ regardless, so 11 is their effective floor.

## Upcoming macOS versions

- **macOS 26 (Tahoe)** is the **last macOS to support Intel Macs**. The Intel slice is fully covered here.
- **macOS 27 ("Golden Gate")** ships in late 2026 and is **Apple Silicon only**. The app still runs on it through the `arm64` slice; there is simply no Intel hardware on that OS.

## Building for all Macs

Produce one app that runs natively on both Intel and Apple Silicon:

```bash
rustup target add x86_64-apple-darwin aarch64-apple-darwin
npm run tauri:build:mac
```

This runs `tauri build --target universal-apple-darwin` and emits a universal `.app` and `.dmg`.

> A plain `npm run tauri:build` on an Apple Silicon Mac produces an `arm64`-only app that will **not** run on Intel Macs. Use `tauri:build:mac` for distribution.

## Notes and caveats

- **10.13 is a hard floor.** Nothing can make a Tauri v2 app run on macOS 10.12 (Sierra) or older.
- **Security updates.** Apple no longer patches 10.13/10.14. To support only versions Apple still maintains, raise `minimumSystemVersion` to `"10.15"` (Catalina) in `tauri.conf.json` — a one-line change.
- **Verification.** The support range above is the configured target. The definitive check is running `npm run tauri:build:mac` on an actual Mac.

## Sources

- [macOS Application Bundle — Tauri v2](https://v2.tauri.app/distribute/macos-application-bundle/)
- [Every macOS version — Macworld](https://www.macworld.com/article/672681/list-of-all-macos-versions-including-the-latest-macos.html)
- [Apple macOS end-of-life dates](https://endoflife.date/macos)
