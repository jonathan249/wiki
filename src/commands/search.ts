import { Console, Effect } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { Search } from "../services/search"
import { State } from "../services/state"
import { Storage } from "../services/storage"

const MAX_LINES_PER_PAGE = 5
const MAX_LINE_WIDTH = 160

const truncate = (text: string) =>
    text.length > MAX_LINE_WIDTH ? text.slice(0, MAX_LINE_WIDTH - 1) + "…" : text

export const search = Command.make("search", {
    query: Argument.String("query").pipe(Argument.withDescription("Words to search for (quote multi-word queries)")),
    all: Flag.Boolean("all").pipe(Flag.withDefault(false), Flag.withAlias("a"), Flag.withDescription("Search every project")),
    exact: Flag.Boolean("exact").pipe(Flag.withDefault(false), Flag.withAlias("e"), Flag.withDescription("Literal substring match instead of ranked search")),
    limit: Flag.Int("limit").pipe(Flag.withDefault(10), Flag.withAlias("n"), Flag.withDescription("Max number of pages to show")),
}, ({ query, all, exact, limit }) => Effect.gen(function* () {
    const projects = all
        ? yield* (yield* Storage).listProjects
        : [yield* (yield* State).getCurrent]
    const svc = yield* Search
    const results = exact
        ? yield* svc.exact(query, { projects, limit })
        : yield* svc.ranked(query, { projects, limit })

    if (results.length === 0) return yield* Console.log(`No matches for "${query}"`)

    for (const r of results) {
        const name = all ? `${r.project}/${r.page}` : r.page
        yield* Console.log(exact ? name : `${name}  (score ${r.score.toFixed(1)})`)
        for (const l of r.lines.slice(0, MAX_LINES_PER_PAGE)) {
            yield* Console.log(`  ${String(l.line).padStart(4)}: ${truncate(l.text)}`)
        }
        const more = r.lines.length - MAX_LINES_PER_PAGE
        if (more > 0) yield* Console.log(`        … ${more} more line${more === 1 ? "" : "s"}`)
    }
})).pipe(Command.withDescription("Search pages (ranked, fuzzy) in the current project, or all with --all"))
