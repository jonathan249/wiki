# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Bun + Effect v4 CLI (`wiki`) for markdown notes stored as `projects/<project>/<page>.md`. It keeps a persistent "current project" and offers ranked full-text search (MiniSearch). See README.md for user-facing commands.

## Commands

```bash
bun install
bun run wiki <command> [...]   # run from source (e.g. bun run wiki search modal)
bun run typecheck              # tsc --noEmit — the only automated check; there is no test suite or linter
bun run build                  # compile standalone binary to dist/wiki (scripts/build.ts)
bun run install-cli            # build + symlink dist/wiki to ~/.local/bin/wiki
```

**Smoke-testing without touching real data:** point both env vars at a scratch folder, then run commands:

```bash
WIKI_PROJECTS_DIR=/tmp/w/projects WIKI_STATE_FILE=/tmp/w/state.json bun src/main.ts new demo
```

Running against the defaults changes the user's real notes (`projects/`) and global state (`~/.config/wiki/state.json`).

## Architecture

The layering is **commands → services → `FileSystem`/`Path` (from `NodeServices`)**.

- `src/commands/*.ts` are thin `Command.make` handlers. They `yield*` services, call them and print with `Console`. They never touch the filesystem directly.
- `src/services/*.ts` are `Context.Service` classes, each with a `static layer`. Dependencies are `Paths` ← `State`, `Storage` ← `Index` ← `Search`. `src/main.ts` composes them into `AppLayer` with `Layer.provideMerge` and registers subcommands in `Command.withSubcommands([...])`. New commands and services must be added in both places.
- **Storage** owns all page I/O and name validation. Page names allow `/` for sub-folders; project names don't. Validation is what keeps paths inside `projectsDir`, so keep it on every new entry point.
- **State** is a JSON file. A missing or corrupt file counts as "no project selected".
- **Index** (`services/index.ts`) persists a MiniSearch index plus per-page change stamps (`mtime:size`, from `Storage.pageStamps`) to `<projectsDir>/.wiki-index.json`. Every query syncs incrementally first: it discards deleted pages and re-adds changed ones, then saves via temp file + rename. That's why `add` and outside edits never need to update the index explicitly. Bump `INDEX_VERSION` whenever `indexOptions` or the stored shape changes; old files are then rebuilt automatically. Documents are whole pages, so ranking is per page.
- **Search** has two modes. `ranked` takes pages from `Index` and then picks lines that match the returned MiniSearch `terms` at word starts, sorted by how many distinct terms each line contains. `exact` (`--exact`) is a substring scan that bypasses the index.
- **Errors** (`src/errors.ts`) are `Schema.TaggedError`s that override `get [CliError.userMessage]()`. `Command.run` prints that message instead of a stack trace, so domain errors should go in the failure channel this way, not be printed by hand. Unexpected I/O failures are `Effect.orDie`'d.
- **Paths**: `projectsDir` resolves in this order: `WIKI_PROJECTS_DIR`, then `process.env.WIKI_DEFAULT_PROJECTS_DIR`, then `projects/` relative to the source. The middle one is baked in by `scripts/build.ts` via `--define`, because a compiled binary can't find the repo relative to `import.meta.dir`.

## Effect v4 notes (the API differs from v3 and from most online examples)

- The CLI is imported from `effect/cli` (`Command`, `Argument`, `Flag`, `CliError`). Do not add `@effect/cli`, which is the v3 package.
- Services are `class X extends Context.Service<X, Shape>()("wiki/X") {}`. `FileSystem`, `Path` and `Stdio` are imported from `"effect"` and yielded as `FileSystem.FileSystem`, `Path.Path` and `Stdio.Stdio`.
- Boolean flags need `Flag.withDefault(false)`; otherwise they are required. Integer flags use `Flag.Int`.
- `Schema.fromJsonString` doesn't exist. Parse with `JSON.parse` inside `Effect.try`, then `Schema.decodeUnknownOption`.
- MiniSearch `SearchResult` stored fields are typed `any`/index-signature, so cast them (`r.project as string`).
- Check exact names in `node_modules/effect/dist/**/*.d.ts` when unsure. Many v3 names were renamed.
