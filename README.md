# wiki

A small command-line wiki for markdown notes, built with [Bun](https://bun.com) and [Effect](https://effect.website) v4.

Notes are plain `.md` files grouped into **projects** (folders under `projects/`). The CLI remembers which project you're working in, so commands like `add`, `get` and `search` act on it by default.

```
$ wiki new rp
Created project "rp" and switched to it

$ echo "# Meeting notes" | wiki add meetings/2026-11-24
Wrote …/projects/rp/meetings/2026-11-24.md

$ wiki search "blocking overlay"
ix-components  (score 2.9)
    47: | Modal | Overlay blocking the page until the user acts or closes it | …
   104: | Loading modal | Blocking overlay until a process finishes | …
```

## Setup

```bash
bun install
```

### Run from source (development)

```bash
bun run wiki <command>
```

### Install as a `wiki` command

```bash
bun run install-cli
```

This compiles a standalone binary to `dist/wiki` and links it to `~/.local/bin/wiki` (make sure that directory is on your `PATH`). The compiled binary starts in about 60 ms, compared with about 200 ms from source.

Run `bun run install-cli` again after changing the code. Your notes don't need a rebuild.

## Commands

| Command | What it does |
|---|---|
| `wiki new <project>` | Create a project and switch to it |
| `wiki use <project>` | Switch the current project |
| `wiki current` | Show the current project |
| `wiki ls` | List pages in the current project |
| `wiki ls -p` | List all projects (`*` marks the current one) |
| `wiki get <page>` | Print a page |
| `wiki add <page> -c "text"` | Create a page from text |
| `… \| wiki add <page>` | Create a page from piped input |
| `wiki add <page> --append …` | Append to an existing page |
| `wiki search <query>` | Ranked search in the current project |
| `wiki search <query> --all` | Search every project |
| `wiki reindex` | Rebuild the search index from scratch |

Every command has `--help`.

### Pages

Page names map to files inside the project: `ideas` → `projects/<project>/ideas.md`, and `notes/today` → `projects/<project>/notes/today.md`. Names may contain letters, numbers, `-`, `_`, and `/` for sub-folders. Project names are a single folder name (no `/`).

`add` refuses to overwrite an existing page. Use `--append` to add to it.

You can also edit the `.md` files directly in your editor. The CLI picks up the changes.

### Search

```bash
wiki search modal                 # ranked, current project
wiki search "date pickr"          # several words, any order, typos allowed
wiki search modal --all           # all projects
wiki search "exact phrase" -e     # literal substring match, no index
wiki search kpi -n 3              # show at most 3 pages
```

- **Ranked mode (default)** uses a [MiniSearch](https://github.com/lucaong/minisearch) full-text index. It matches word prefixes, tolerates small typos and ranks pages by relevance (page names count extra). Under each page, the lines matching the most query words are shown first, up to 5 per page.
- **Exact mode (`--exact`, `-e`)** does a plain, case-insensitive substring scan of every page, in file order.

Quote multi-word queries, otherwise only the first word is used.

The index lives at `projects/.wiki-index.json` (gitignored). Each search checks file modification times and re-indexes only changed pages, so you never need to update it by hand. `wiki reindex` is there in case it gets out of sync.

Ranking works per page. A single large page (such as one big table) always ranks as one result, and only its line order changes.

## Configuration

| What | Default | Override |
|---|---|---|
| Notes folder | `projects/` in this repo (baked into the compiled binary at build time) | `WIKI_PROJECTS_DIR` |
| Current-project state | `~/.config/wiki/state.json` | `WIKI_STATE_FILE` |

The current project is stored globally, so `wiki` works the same from any directory.

## Development

```bash
bun run wiki <command>   # run from source
bun run typecheck        # tsc --noEmit
bun run build            # compile dist/wiki
```

### Project structure

```
src/
├── main.ts            # root command, subcommands, layer wiring
├── errors.ts          # tagged errors with user-facing messages
├── commands/          # one file per CLI command: parse args, call services, print
│   ├── new.ts  use.ts  current.ts  list.ts
│   ├── get.ts  add.ts
│   └── search.ts  reindex.ts
└── services/          # all logic, as Effect services + layers
    ├── paths.ts       # resolves the notes folder and state file
    ├── state.ts       # persistent "current project"
    ├── storage.ts     # read/write/list markdown pages, name validation
    ├── index.ts       # MiniSearch index: load, incremental sync, query
    └── search.ts      # ranked + exact search, line matching
scripts/
└── build.ts           # compiles dist/wiki with the projects path baked in
```

Commands stay thin. They read arguments, call services and print output. All file access goes through `Storage`, so commands never touch the filesystem directly.

Errors are `Schema.TaggedError`s that carry a `CliError.userMessage`. The CLI prints that message instead of a stack trace (e.g. `No project selected. Run wiki use <project> first.`).

### Adding a command

1. Create `src/commands/<name>.ts` with `Command.make(...)`.
2. Add it to `Command.withSubcommands([...])` in `src/main.ts`.
3. If it needs a new service, add its layer to `AppLayer` in `src/main.ts`.

Boolean flags need `Flag.withDefault(false)`. Without it, Effect v4 treats them as required.
