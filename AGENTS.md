# Repository Guidelines

## Project Structure & Module Organization
- Library source lives in `src/` (TypeScript wrappers, model manager, entry exports). Generated JS/typedefs land in `lib/` after the module build.
- Native projects live in `android/` and `ios/`; keep platform-specific tweaks isolated to those folders.
- Documentation assets and site content sit in `docs/` and `assets/`. The demo app is in `example-bare/` for end-to-end validation.

## Build, Test, and Development Commands
- `npm run build` — builds the module via TypeScript, emitting `lib/`.
- `npm run lint` — runs the configured lint rules; fix warnings before opening a PR.
- `npm run clean` — removes generated artifacts.
- Example app: `npm install && npm run start` (or `npm run android`/`ios`) from `example-bare/` to verify integration.

## Coding Style & Naming Conventions
- TypeScript-first; prefer explicit return types on public APIs. Use 2-space indentation and trailing commas where sensible.
- Components/hooks/functions: `PascalCase` for components, `useCamelCase` for hooks, `camelCase` for internals, and `SCREAMING_SNAKE_CASE` for constants.
- Keep platform-specific code clearly separated (e.g., platform guards or platform folders) to avoid cross-platform regressions.
- Run `npm run lint` before committing; address auto-fixable items.

## Testing Guidelines
- Add/extend Jest tests alongside implementations (e.g., `__tests__` near `src/` logic) when changing model management or API surfaces.
- For native-facing changes, validate on Android (SDK 24+) and iOS (14+) using the example app; note any platform caveats in the PR.
- Aim to cover new behaviors and error paths; avoid merging with broken or skipped tests.

## Commit & Pull Request Guidelines
- Use concise, typed prefixes seen in history (`docs:`, `chore:`, `update:`) plus a short imperative description (e.g., `docs: refresh README assets`).
- Keep commits scoped; avoid mixing lint fixes with feature changes.
- PRs should include: purpose and scope, testing performed (commands/devices), screenshots or logs for user-visible changes, and links to related issues.
- Ensure the branch is rebased on main and all checks pass before requesting review.

## Security & Configuration Tips
- Do not commit model binaries or large assets; reference download URLs instead.
- Keep API keys and secrets out of the repo; rely on environment configs when needed.
- Confirm platform minimums (iOS 14+, Android SDK 24) when adding dependencies or APIs.

## API Overview
- Main hook: `useLlm` - React hook for model lifecycle and generation
- Functional API: `loadModel`, `loadModelFromAsset`, `generateText`, `streamText`, `releaseModel`, `stopGeneration`
- Model Manager: `modelManager` singleton for download management
- Native module: `LitertLlm` for direct native bridge access

## Multimodal Support (Android only)
- Native module supports multimodal options: `enableVisionModality`, `enableAudioModality`, `maxNumImages`
- Multimodal content is automatically processed from `ModelMessage` arrays
- Image/audio content types are detected via `ImagePart` and `FilePart` in message content
- Android requires `tasks-vision:0.10.29` for image support; audio expects mono WAV format
- Vision/audio flags default to `false`, so opt in per model configuration

