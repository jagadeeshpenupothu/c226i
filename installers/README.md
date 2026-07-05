# PrintPilot Installers

Distributable installers for PrintPilot `v0.1.0`, organized by platform.

```
installers/
├── linux/     .deb + .AppImage  (built locally on Linux)
├── windows/   .msi + .exe       (built by CI — see below)
└── macos/     .dmg              (built by CI — see below)
```

## What can be built where

| Platform | Artifacts | How it's produced |
|----------|-----------|-------------------|
| **Linux** | `.deb`, `.AppImage` | Built locally with `npm run tauri:build`. Present in [`linux/`](linux/). |
| **Windows** | `.msi` (WiX), `.exe` (NSIS) | Built by the [`Release` GitHub Actions workflow](../.github/workflows/release.yml) on a `windows-latest` runner. |
| **macOS** | `.dmg` (Apple Silicon + Intel) | Built by the same workflow on a `macos-latest` runner. |

**Why aren't the Windows/macOS installers checked in yet?** They cannot be
cross-compiled from Linux: a macOS `.dmg` needs macOS's `hdiutil`/codesign
toolchain, and Windows `.msi`/`.exe` bundling needs a Windows (or Wine + MinGW +
NSIS) host. The `Release` workflow builds each one on its native runner — the
standard, reproducible way to ship a Tauri app for all platforms.

## Producing the Windows + macOS installers

Push a version tag (or run the workflow manually from the **Actions** tab):

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow attaches every installer (Windows `.msi`/`.exe`, macOS `.dmg` for
both architectures, and the Linux packages) to a **draft GitHub Release**.
Download them from there, or drop them into `windows/` and `macos/` here if you
want them tracked in-repo.

## Installing (Linux)

**Debian / Ubuntu (`.deb`):**
```bash
sudo apt install ./PrintPilot_0.1.0_amd64.deb
# or: sudo dpkg -i PrintPilot_0.1.0_amd64.deb && sudo apt-get -f install
```

**AppImage (portable, any distro):**
```bash
chmod +x PrintPilot_0.1.0_amd64.AppImage
./PrintPilot_0.1.0_amd64.AppImage
```

Verify a download against [`linux/SHA256SUMS.txt`](linux/SHA256SUMS.txt):
```bash
cd linux && sha256sum -c SHA256SUMS.txt
```

> **Note:** Installer binaries are large. If you'd rather not track them in git,
> add `installers/**/*.deb`, `installers/**/*.AppImage`, `installers/**/*.dmg`,
> `installers/**/*.msi`, and `installers/**/*.exe` to `.gitignore` and rely on
> GitHub Releases for distribution instead.
