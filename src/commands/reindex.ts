import { Console, Effect } from "effect"
import { Command } from "effect/cli"
import { Index } from "../services/index"

export const reindex = Command.make("reindex", {}, () => Effect.gen(function* () {
    const stats = yield* (yield* Index).refresh({ rebuild: true })
    yield* Console.log(`Indexed ${stats.total} page${stats.total === 1 ? "" : "s"}`)
})).pipe(Command.withDescription("Rebuild the search index from scratch"))
