import { Console, Effect } from "effect"
import { Argument, Command } from "effect/cli"
import { State } from "../services/state"
import { Storage } from "../services/storage"

export const get = Command.make("get", {
    page: Argument.String("page").pipe(Argument.withDescription("Page name, e.g. `ideas` or `notes/today`")),
}, ({ page }) => Effect.gen(function* () {
    const project = yield* (yield* State).getCurrent
    yield* Console.log((yield* (yield* Storage).readPage(project, page)).trimEnd())
})).pipe(Command.withDescription("Print a page from the current project"))
