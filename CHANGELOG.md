# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Repository tooling: ESLint, Prettier, EditorConfig, CI workflow, contributing guide.

### Fixed
- `useOptimisticMutation`: a superseded or aborted mutation that settled late could
  overwrite newer data and fire callbacks. Stale results are now ignored, and `abort()`
  restores committed data and clears the pending flags.
- `useAsyncQueue`: a pending task could be started more than once when the queue was
  processed several times before React re-rendered.

## [1.0.0]

### Added

- `useOptimisticMutation`, `useEventStream`, `useVirtualWindow`,
  `useDebouncedCallback`, `useThrottledCallback`, `useAsyncQueue`, `usePrevious`.
