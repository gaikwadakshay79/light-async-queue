# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-02-17

### Changed

- **Migrated from npm to pnpm** for better performance and disk space efficiency
- **Updated Node.js requirement** from >=18.0.0 to >=19.0.0 (required for `node:inspector/promises`)
- **Updated dependencies to latest versions:**
  - ESLint: 8.56.0 → 10.0.0
  - @typescript-eslint/eslint-plugin: 6.15.0 → 8.56.0
  - @typescript-eslint/parser: 6.15.0 → 8.56.0
  - TypeScript: 5.3.0 → 5.9.3
  - Vitest: 4.0.18 (with proper configuration)
  - @vitest/coverage-v8: 4.0.18

### Fixed

- **Fixed Vitest `node:inspector/promises` error** by configuring proper thread pool settings
- **Migrated to ESLint 10 flat config** (removed deprecated `.eslintrc.json`)
- **Fixed linting errors** with unused variables in catch blocks
- **Updated GitHub Actions workflows:**
  - Replaced deprecated `actions/create-release@v1` with `softprops/action-gh-release@v2`
  - Updated `actions/upload-artifact` from v3 to v4
  - Fixed permission issues with GitHub release creation

### Added

- Added `.npmrc` configuration for pnpm
- Added `packageManager` field in package.json
- Added `eslint.config.js` with ESLint 10 flat config
- Added `PNPM_MIGRATION.md` documentation
- Added architecture diagram to README
- Added this CHANGELOG.md file

### Documentation

- Updated README with architecture diagram image
- Updated TypeScript badge to reflect v5.9
- Updated test count to 42 tests (from 25)
- Enhanced architecture section with visual diagram and detailed component descriptions

## [1.0.0] - 2026-02-17

### Added

- Initial release of light-async-queue
- File-based and memory-based storage options
- Worker process isolation using `child_process.fork()`
- Exponential backoff retry strategy
- Dead Letter Queue (DLQ) for failed jobs
- Crash recovery for file-based storage
- Graceful shutdown handling
- Queue statistics and monitoring
- TypeScript support with full type safety
- Zero external dependencies
- Comprehensive test suite (42 tests)
- Example scripts for common use cases
- Complete API documentation

### Features

- Reliable job processing with persistence
- Configurable concurrency control
- Smart retry logic with exponential backoff
- Job status tracking (pending, processing, completed, failed)
- Automatic crash recovery
- IPC-based worker communication
- Signal handling (SIGINT, SIGTERM)

[1.0.1]: https://github.com/gaikwadakshay79/light-async-queue/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/gaikwadakshay79/light-async-queue/releases/tag/v1.0.0
