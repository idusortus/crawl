# Design

## Context

See `proposal.md` → Why. This is a **tooling/CI** change (`skip_specs: true`) — no runtime behavior changes. The app is an Expo SDK 57 (React Native 0.86, React 19.2.3) project on Node 24 with `app.json` present and a placeholder `App.tsx`. The repo's origin is `github.com/idusortus/crawl`, on branch `main`, and `gh` is authenticated with `workflow` scope. `.gitignore` already excludes `/android` and `/ios`, so `expo prebuild` output is not committed (Continuous Native Generation).

The constraint that shapes everything: **the build must be self-contained in the repo with no external accounts or secrets** (user chose the local-Gradle path over EAS). A debug-signed release APK is acceptable (user chose simplest signing).

## Goals / Non-Goals

**Goals:**
- A reproducible GitHub Actions workflow that produces an installable `crawl-<tag>.apk` and attaches it to a GitHub Release, triggered by a `v*` tag or manual dispatch.
- Zero required secrets; deterministic, cached, loud-on-failure steps.
- Correct toolchain pinning for Expo SDK 57 / RN 0.86 (JDK, Android SDK/compileSdk) so the build does not drift.

**Non-Goals:**
- No EAS Build, no Play Store `.aab`/upload, no iOS, no production keystore, no UI code (Stage 5).
- No changes to `src/engine/**` or runtime behavior; no spec changes.

## Decisions

### D1 — Local Gradle release build on the GitHub runner (`expo prebuild` + `./gradlew assembleRelease`)
`npx expo prebuild --platform android --no-install` generates the `android/` project from `app.json` + config plugins on the runner; then `./gradlew assembleRelease` produces `android/app/build/outputs/apk/release/app-release.apk`. *Alternatives:* EAS Build (rejected by user: external account + token + cloud minutes); committing the `android/` folder (rejected: defeats CNG, huge diff, drift). The runner image provides the Android SDK and JDK, so no SDK install is needed — only correct versions.

### D2 — Debug-keystore signing for the release variant
Gradle's `assembleRelease` for an RN/Expo project signs with the **debug keystore** unless a release `signingConfig` is provided. We take the simplest zero-secret path: build a release APK signed by the auto-generated debug key (via a Gradle property or by letting the default `signingConfig` apply), which installs fine for testing. *Trade-off:* not upgrade-stable against a future properly-signed build and not Play-Store-valid. `design` records the migration path (add `SIGNING_*` secrets + a `signingConfig` block) as a documented follow-up, not done now.

### D3 — Trigger on `v*` tag push and `workflow_dispatch`
`on: push: tags: ['v*']` plus `workflow_dispatch` (with an optional version input). On a tag, the workflow creates/updates a GitHub Release for that tag and uploads the APK; on manual dispatch it uploads a workflow artifact and (if a tag input is given) can attach to a release. *Alternatives:* every-push builds (rejected: wasteful, no artifact worth shipping yet); release-created events (rejected: circular with the upload step).

### D4 — Toolchain pinning
- **JDK 17** (Expo SDK 57 / RN 0.86 build requirement; RN 0.86 uses AGP 8.x which requires JDK 17). Use `actions/setup-java@v4` with `temurin` 17.
- **Node**: use the repo's tested major via `actions/setup-node@v4` (`node-version: 22.13` floor from `AGENTS.md`, or `24` to match dev). Pin to the `engines`/documented floor.
- **Android SDK**: rely on the GitHub `ubuntu-latest` image's preinstalled SDK; pin `compileSdk`/`targetSdk`/`buildTools` via `expo-build-properties` only if needed (the effective RN 0.86.3 / Expo SDK 57 values are compileSdk 36 / targetSdk 36 / buildTools 36.0.0, read from React Native's version catalog mounted as Expo's `expoLibs`; the `ubuntu-latest` image already ships platform `android-36`, so `expo-build-properties` remains unnecessary — don't override unless the runner lacks them).
- Add `android.package` (e.g. `com.idusortus.crawl`) and `android.versionCode` to `app.json` — an APK needs a stable applicationId.

### D5 — Steps, caching, and failure is loud
Order: checkout → setup Node (+ npm cache) → setup JDK 17 → `npm ci` → `npx expo prebuild --platform android --no-install` → `./gradlew assembleRelease` with `actions/cache` on `~/.gradle/caches` and `~/.gradle/wrapper` (keyed by Gradle files) → locate the APK → assert it exists and is non-empty (fail loudly if not) → rename to `crawl-<tag>.apk` → upload (Release asset and/or workflow artifact). A missing/zero-byte APK fails the job rather than silently "succeeding".

### D6 — Release creation uses the built-in `GITHUB_TOKEN`
`gh release create`/`softprops/action-gh-release` with `permissions: contents: write`. No PAT required. The workflow is idempotent-ish: if the release exists for a tag, upload/replace the asset rather than erroring.

### D7 — Verification without a device
CI cannot install the APK. "Verified" means: the workflow **runs green**, `app-release.apk` is produced and non-empty, and its signing is confirmed via `apksigner verify` (present in the runner's build-tools) as a sanity step. The human pulls the artifact from the GitHub Release and sideloads it. Document the exact download URL pattern in the README.

## Risks / Trade-offs

- **RN 0.86 build fragility on CI** (NDK/SDK/AGP version mismatch) → Mitigation: pin JDK 17 + documented SDK 57 SDK levels; rely on the runner image's preinstalled SDK; keep `expo-build-properties` overrides minimal; cache Gradle.
- **First build is slow / cache misses** → Mitigation: Gradle cache keyed on gradle files; acceptable for a tagged release cadence.
- **Debug-keystore artifact is not production-grade** → Mitigation: documented explicitly; migration to a real keystore is a one-file change plus secrets.
- **No app worth installing yet** → Mitigation: acceptable — the pipeline is proven now; Stage 5 makes it worth downloading. The APK will boot the placeholder screen.
- **`expo prebuild` non-determinism across Expo patch versions** → Mitigation: `npm ci` on the lockfile + pinning the Expo patch in `package.json` (`~57.0.26`).

## Migration Plan

Additive. Order: add `android.package`/`versionCode` to `app.json` (+ `expo-build-properties` only if needed) → author `.github/workflows/android-apk.yml` → document release steps in `README`/`PROJECT.md` → validate the workflow YAML locally (`actionlint` if available, else parse) → push; first real run is on the first `v*` tag (or a manual dispatch). Rollback = delete the workflow file.

## Open Questions

- **NDK version (the one genuinely open risk).** RN 0.86.3's version catalog requests NDK `27.1.12297006`, while the `ubuntu-latest` image ships newer NDKs (`27.3.13750724` / `28.2` / `29.0`). Gradle's license-accepted SDK provisioning may therefore auto-download the pinned `27.1.12297006` (~1 GB) on the **first workflow run**, adding build time. This is resolved empirically on that first run; if it is unacceptable, the one-line fix is `expo-build-properties` (currently deliberately absent), and it changes neither the specs (none) nor the approach. The previously open SDK-target question is settled: the effective RN 0.86.3 / Expo SDK 57 values are compileSdk 36 / targetSdk 36 / buildTools 36.0.0, and `ubuntu-latest` already ships platform `android-36`, so `expo-build-properties` is not needed for the SDK targets.
