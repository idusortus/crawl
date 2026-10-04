# Proposal

## Why

There is no way to get `crawl` onto a physical Android device. Until a build can be produced and downloaded, every stage stays "verified in a terminal" and nothing is playable or shareable. This change wires up a GitHub Actions pipeline that builds an **installable Android `.apk`** and attaches it to a GitHub Release, so each tagged version can be installed and tested on a real phone. It is deliberately scheduled after Stage 3 (per the user's sequencing) and before Stage 5's rendering work, so the delivery path exists before there is UI to try.

This is **tooling/CI only** — it changes no engine or game behavior, so the change sets `skip_specs: true`.

## What Changes

- **A GitHub Actions workflow** (`.github/workflows/android-apk.yml`) that, on a **version tag push** (`v*`) or **manual `workflow_dispatch`**, builds a release-mode Android APK and attaches it to a **GitHub Release** for that tag.
- **Build approach:** `npx expo prebuild --platform android` generates the native project on the runner, then `./gradlew assembleRelease` builds the APK. No Expo cloud account or EAS token is required — the build is self-contained in the repo and uses the Android SDK/JDK the GitHub-hosted runner already provides.
- **Signing:** the release APK is signed with a generated **debug keystore** (simplest, zero secrets). This is an install-and-test artifact, not a Play Store submission; the trade-off is recorded and the path to a proper release keystore is documented.
- **Artifact naming:** `crawl-<tag>.apk` attached to the Release, plus uploaded as a workflow artifact for manual-dispatch runs.
- **Deterministic, cached, minimal steps:** Node + Java setup, `npm ci`, Gradle cache, prebuild, assemble, sign check, upload. The workflow fails loudly if the APK is missing or unsigned.
- **Docs:** `README`/`PROJECT.md` note how to cut a release and where to download the APK; the one-time local keystore note (for the future proper-release path) is documented.
- **Compatibility guard:** the workflow pins an Android SDK/JDK that the current Expo SDK 57 / RN 0.86 toolchain supports, and documents the required versions.

**Not in this change:** no EAS Build, no Play Store `.aab`/upload, no iOS build, no code signing with a production keystore, no application code or UI (that is Stage 5). The app currently boots a placeholder screen; the pipeline builds whatever is present.

## Impact

- **New files:** `.github/workflows/android-apk.yml`; possibly a small `eas.json`-free build config or Gradle property passthrough if needed; `README`/`PROJECT.md` release instructions.
- **Config touched:** `app.json` may gain an `android.versionCode` / `android.package` (needed for a real APK build) if not already present.
- **No engine/code behavior change** — `src/engine/**` and the app's runtime are untouched. `openspec/specs/**` is unchanged (`skip_specs: true`).
- **CI cost:** GitHub-hosted runner minutes per tagged release; Gradle caching keeps rebuilds fast. No secrets required for the debug-keystore path.
- **Repo:** the pipeline pushes to the existing `origin` (`github.com/idusortus/crawl`); release creation needs the default `GITHUB_TOKEN` (already available to Actions).

## Non-goals / trade-offs

- **Debug-signed APK** is installable for testing but not upgrade-stable across differently-signed builds once a real keystore is introduced — noted as a known limitation with a documented migration to a release keystore.
- **No store distribution.** This is sideload/testing only.
