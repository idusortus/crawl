# Tasks

## 1. Android app config prerequisites

- [x] 1.1 Add `android.package` (e.g. `com.idusortus.crawl`) and `android.versionCode` to `app.json` (needed for a real APK applicationId/version); verify `npx expo config --type public` resolves without error and shows the new fields
- [x] 1.2 Confirm `expo-build-properties` is not required, or install/pin it if the runner's Android SDK lacks the SDK 57 targets (compileSdk 37 / targetSdk 36 / buildTools 37.0.0); record the decision in the change
  - **Decision (recorded, no `expo-build-properties`):** kept absent per locked decision D4. Effective SDK defaults come from React Native's version catalog (`node_modules/react-native/gradle/libs.versions.toml`, exposed to Gradle as Expo's `expoLibs` catalog): **minSdk 24 / compileSdk 36 / targetSdk 36 / buildTools 36.0.0 / NDK 27.1.12297006 / AGP 8.12.0 / Kotlin 2.1.20**. The design's assumed "compileSdk 37 / buildTools 37.0.0" does not match this SDK 57 / RN 0.86.3 toolchain — the effective values are 36 / 36.0.0 (targetSdk 36 matches). `ubuntu-latest` plus Gradle's license-accepted SDK auto-provisioning is assumed to supply platform 36 / build-tools 36.0.0; this is the open question resolved authoritatively on the **first live workflow run** (a mismatch is a one-line `expo-build-properties` addition, not installed now).
- [x] 1.3 Verify `.gitignore` excludes `/android` and `/ios` so prebuild output is never committed (CNG); confirm no native folders are tracked

## 2. GitHub Actions workflow

- [x] 2.1 Author `.github/workflows/android-apk.yml` with triggers `push: tags: ['v*']` and `workflow_dispatch` (optional version input), `permissions: contents: write`, and a single build job
- [x] 2.2 Wire the build steps: `actions/checkout@v4` → `actions/setup-node@v4` (Node matching the project floor, npm cache) → `actions/setup-java@v4` (temurin 17) → `npm ci` → `npx expo prebuild --platform android --no-install` → `./gradlew assembleRelease` with `actions/cache` on the Gradle caches/wrapper
- [x] 2.3 Add the loud-failure + packaging steps: locate `android/app/build/outputs/apk/release/app-release.apk`, fail if missing/zero-byte, rename to `crawl-<tag-or-sha>.apk`, and run `apksigner verify` as a signing sanity check
- [x] 2.4 Add the publish step: on a tag, create/update the GitHub Release for the tag and upload the APK asset (via `gh release` or `softprops/action-gh-release`), idempotent if the release already exists; on manual dispatch, also upload the APK as a workflow artifact
- [x] 2.5 Validate the workflow file: YAML parses and references resolve (run `actionlint` if available, otherwise a YAML parse + a careful review of action versions/permissions) — `actionlint` unavailable locally; parsed with the `yaml` package and reviewed (see session report)

## 3. Documentation

- [x] 3.1 Document the release process in `README.md`/`PROJECT.md`: how to cut a release (`git tag vX.Y.Z && git push origin vX.Y.Z`), where the APK appears (the GitHub Release), and the manual-dispatch alternative
- [x] 3.2 Document the debug-keystore limitation and the migration to a production keystore (add `SIGNING_*` secrets + a `signingConfig` block) as a clearly-marked future step

## 4. Verification & docs

- [x] 4.1 Run the full engine test suite + lint + `tsc --noEmit` to confirm this tooling change did NOT regress the engine (all green, unchanged count) — 212 tests, lint 0, tsc 0
- [x] 4.2 Attempt an authoritative validation of the pipeline without a device: if the toolchain is available locally, at minimum run `npx expo prebuild --platform android --no-install` in a throwaway copy to confirm it generates without error (do NOT commit the output); otherwise record that the first live run is the authoritative check — generated `android/` in a throwaway copy; release buildType carries `signingConfig signingConfigs.debug`
- [x] 4.3 Update `STATE.md`, append a `decisions.md` entry (local-Gradle vs EAS; debug-keystore choice; trigger model; toolchain pins), log the session in `agent-diary.md`/`histories/*`, and update `PROJECT.md`/`AGENTS.md` roadmap status
- [x] 4.4 Verify `openspec validate android-apk-release-pipeline --strict` passes (with `skip_specs: true`) — `Change 'android-apk-release-pipeline' is valid`
