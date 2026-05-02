# Contributing

Thanks for your interest in `stagehand-social-sdk`. This repo is small and the codebase is intentionally simple — most adapters are 200–400 lines of natural-language Stagehand calls.

## Quick start

```bash
git clone https://github.com/loveloud-creatives/stagehand-social-sdk.git
cd stagehand-social-sdk

# TypeScript side
cd packages/typescript
npm install
npm run build
npm test

# Python side
cd ../python
pip install -e ".[dev]"
ruff check stagehand_social
pytest
```

## Adding a new platform adapter

1. Create `packages/typescript/src/platforms/<name>.ts` extending `BasePlatform`.
2. Implement `loginUrl`, `performLogin`, `isLoggedIn`, `post`, `comment`, `like`, `unlike`, `follow`, `unfollow`.
3. Add a Python mirror at `packages/python/stagehand_social/platforms/<name>.py`.
4. Register it in:
   - `packages/typescript/src/core/SocialSDK.ts` (`loadAdapters` + `PlatformAccess`)
   - `packages/typescript/src/index.ts` (re-export)
   - `packages/python/stagehand_social/core/social_sdk.py` (`platform()` switch + `_PlatformAccess`)
   - `packages/python/stagehand_social/__init__.py` (re-export)
5. Add `docs/platforms/<name>.md`.
6. Add an example to `examples/` in both languages.
7. PR.

## Fixing a broken adapter

When a platform redesigns and breaks an adapter, the fix is usually a one-line change to a Stagehand `act()` prompt. Be specific — "Click the 'Share' button at the bottom of the composer dialog" is more robust than "Click Share".

If the entire flow has changed (rare), rewrite the affected method and bump the SDK version.

## Style

- TypeScript: strict mode, ESM modules, `.js` import extensions on TS files.
- Python: ruff with default rules + `I` (isort), 100-char line length, async/await everywhere.
- Both languages: identical method names, identical input shapes, identical error types. Parity matters.

## Tests

- Unit tests: mock Stagehand. Verify each adapter calls `act()` / `extract()` with the expected prompts.
- Integration tests: behind `RUN_INTEGRATION_TESTS=1` env flag with real credentials. Don't commit credentials.

## License

By contributing, you agree your contributions are licensed under MIT, the same as the rest of the project.
