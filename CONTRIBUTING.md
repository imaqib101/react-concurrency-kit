# Contributing

Thanks for your interest in improving `@imaqib101/react-concurrency-kit`.

## Setup

Requires Node.js 18+ (see `.nvmrc` for the version used in CI).

```bash
npm ci
```

## Workflow

1. Create a branch off `main` (`feat/...`, `fix/...`, `docs/...`).
2. Make your change with tests. Bug fixes should include a regression test.
3. Run the full check locally:

   ```bash
   npm run lint
   npm run format:check
   npm run typecheck
   npm test
   npm run build
   ```

4. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages
   (for example `fix(useAsyncQueue): avoid double-starting tasks`).
5. Add an entry under `[Unreleased]` in `CHANGELOG.md` for user-visible changes.
6. Open a pull request describing the motivation and the change.

## Reporting bugs

Please open an issue with a minimal reproduction, the React version and the
package version.
