# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-02-27

### 🚀 Major Release: BullMQ Feature Parity

This is a **major release** that transforms light-async-queue into a complete BullMQ alternative with enterprise-grade features while maintaining zero dependencies and Redis-free architecture.

### ✨ Added - Core Features

#### Job Events & Listeners

- **Queue now extends EventEmitter** for comprehensive event-driven architecture
- New events: `waiting`, `delayed`, `active`, `progress`, `completed`, `failed`, `stalled`, `drained`, `error`
- Type-safe event handlers with proper TypeScript signatures
- Webhook support for HTTP callbacks on job events

#### Job Priorities

- Jobs can be assigned numeric priority levels (higher = more important)
- Scheduler automatically sorts by priority before nextRunAt
- Fair processing within same priority level

#### Delayed Jobs

- Schedule jobs to execute after a specific delay
- New `DELAYED` job status
- Millisecond-precision timing
- Automatic transition to pending when ready

#### Repeating Jobs

- **Interval-based repeating** - Execute every X milliseconds
- **Cron pattern support** - Full 5-field cron expressions (minute hour day month weekday)
- Optional repeat limits and date ranges
- Automatic scheduling of next instance after completion

#### Job Progress Tracking

- Jobs can report progress updates (0-100%)
- Real-time progress events via IPC between worker and parent
- Progress persisted to storage
- New `updateProgress()` method in job processor

#### Job Dependencies & Flows

- Jobs can depend on other jobs completing first
- DAG (Directed Acyclic Graph) execution support
- New `WAITING` status for jobs with unmet dependencies
- Automatic dependency resolution and job unlocking
- Track completed job IDs in memory

#### Rate Limiting

- Token bucket algorithm implementation
- Configure max jobs per time duration
- Non-blocking rate limit enforcement
- Automatic token refill

#### Stalled Job Detection

- Periodic checks for jobs stuck in processing state
- Configurable stalled threshold (default: 30s)
- New `STALLED` status and events
- Tracks job start/completion timestamps

### 🛠️ Added - Utilities & Infrastructure

#### New Utility Classes

- **CronParser** - Parse and calculate next run times for cron patterns
  - Supports wildcards (_), ranges (1-5), steps (_/5), lists (1,3,5)
  - Calculates next execution up to 1 year ahead
- **RateLimiter** - Token bucket rate limiting implementation
- **WebhookManager** - HTTP/HTTPS webhook sender with custom headers

#### Enhanced Queue Operations

- `getJob(jobId)` - Get specific job by ID
- `removeJob(jobId)` - Remove non-active job
- `pause()` - Pause job processing
- `resume()` - Resume processing
- `drain()` - Wait for all pending jobs to complete
- `clean(maxAge)` - Remove old completed jobs

### 📊 Changed - Type System

#### Extended JobData Interface

- Added `priority: number` - Job priority level
- Added `progress: number` - Current progress (0-100)
- Added `delay: number` - Initial delay in milliseconds
- Added `repeatConfig?: RepeatConfig` - Repeat configuration
- Added `repeatCount: number` - Number of times repeated
- Added `dependsOn?: string[]` - Job dependencies
- Added `parentJobId?: string` - Parent job for flows
- Added `result?: unknown` - Job execution result
- Added `error?: string` - Error message if failed
- Added `startedAt?: number` - When processing started
- Added `completedAt?: number` - When processing completed

#### New Interfaces

- `JobOptions` - Options when adding jobs (priority, delay, repeat, dependsOn, jobId)
- `RepeatConfig` - Repeat job configuration (every, pattern, limit, startDate, endDate)
- `RateLimiterConfig` - Rate limiting configuration (max, duration)
- `WebhookConfig` - Webhook configuration (url, events, headers)
- `QueueEvents` - Type-safe event handler signatures
- `JobWithMethods` - Job object with methods for processor

#### Extended QueueConfig Interface

- Added `rateLimiter?: RateLimiterConfig` - Rate limiting settings
- Added `webhooks?: WebhookConfig[]` - Webhook configurations
- Added `stalledInterval?: number` - Stalled check interval

#### New Enums

- `QueueEventType` - All queue event types
- Extended `JobStatus` with `WAITING`, `DELAYED`, `STALLED`

### 🔧 Changed - Core Functionality

#### Queue Class Enhancements

- Now extends EventEmitter for event emission
- Tracks completed job IDs for dependency resolution
- Manages repeating job timers
- Implements rate limiting checks before dispatch
- Periodic stalled job detection
- Webhook notifications for events
- Enhanced graceful shutdown (stops timers, stalled checker)

#### Job Class Enhancements

- New method: `updateProgress(progress)` - Update job progress
- New method: `markStalled()` - Mark job as stalled
- New method: `isStalled(threshold)` - Check if job is stalled
- New method: `areDependenciesSatisfied(completedIds)` - Check dependencies
- New method: `createRepeatInstance()` - Create next repeat instance
- Enhanced `markCompleted(result)` - Store result
- Enhanced `markFailed(error, nextRunAt)` - Store error message

#### Scheduler Enhancements

- Sorts jobs by priority (descending) then nextRunAt (ascending)
- Ensures high-priority jobs execute first

#### Worker Enhancements

- Handles progress messages from child process
- Passes JobWithMethods to processor with `updateProgress()` and `log()` methods
- Enhanced IPC communication for progress tracking

#### Child Processor Enhancements

- Creates JobWithMethods object with progress reporting
- Sends progress updates to parent via IPC
- Implements `job.updateProgress()` and `job.log()` methods

### 📚 Documentation

#### Updated README.md

- Added "BullMQ Compatible" features section
- Comprehensive API reference for all new features
- Event listener examples
- Job options examples (priority, delay, repeat, dependencies)
- Enhanced queue operations documentation
- Updated comparison table (BullMQ vs Bull vs light-async-queue)
- Added advanced features example reference

#### New Documentation Files

- **FEATURES.md** - Complete feature implementation details
  - Feature descriptions and usage examples
  - Implementation notes
  - BullMQ comparison matrix
  - Migration guide from BullMQ

#### New Examples

- **example/advanced-features.ts** - Comprehensive demo of all features
  - Job events and listeners
  - Job priorities
  - Delayed jobs
  - Repeating jobs (interval and cron)
  - Job dependencies
  - Progress tracking
  - Queue operations (pause, resume, drain, clean)

### 🧪 Testing

- All tests passing (85+ tests across 8 test suites)
- Updated tests for new Job signatures (markFailed now requires error parameter)
- Updated mock JobData objects with new required fields
- Fixed Worker test to include all JobData fields

### 📦 Package Updates

- Version bumped to 2.0.0
- Updated description to mention BullMQ alternative
- Added keywords: bullmq, bull, cron, scheduler, job-dependencies, rate-limiting, webhooks, event-driven, progress-tracking, priority-queue, delayed-jobs, repeating-jobs

### 🎯 Breaking Changes

- **Job.markFailed()** now requires `error: string` parameter
- **JobData interface** has many new required fields (existing code needs to add: priority, progress, delay, repeatCount)
- **Queue.process()** now receives `JobWithMethods` instead of plain `JobData`
- Job statuses changed: `pending` now distinguishes between `WAITING`, `DELAYED`, `PENDING`

### 🔄 Migration Guide

See FEATURES.md for detailed migration instructions from BullMQ.

Most BullMQ code is compatible with minimal changes - just replace the Queue import and remove Redis configuration!

---

## [1.1.0] - 2026-02-27

### Fixed

- **Updated README documentation** to use constant enums (`StorageType`, `BackoffStrategyType`) instead of hardcoded string literals, ensuring consistency with the codebase

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
