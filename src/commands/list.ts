import { Console, Effect } from "effect"
import { Command, Flag } from "effect/cli"
import { State } from "../services/state"
import { Storage } from "../services/storage"

export const list = Command.make("ls", {
    projects: Flag.Boolean("projects").pipe(Flag.withDefault(false), Flag.withAlias("p"), Flag.withDescription("List projects instead of pages")),
}, ({ projects }) => Effect.gen(function* () {
    const storage = yield* Storage
    if (projects) {
        const current = yield* (yield* State).getCurrent.pipe(Effect.orElseSucceed(() => undefined))
        for (const p of yield* storage.listProjects) {
            yield* Console.log(`${p === current ? "*" : " "} ${p}`)
        }
        return
    }
    const project = yield* (yield* State).getCurrent
    for (const page of yield* storage.listPages(project)) yield* Console.log(page)
})).pipe(Command.withDescription("List pages in the current project (or projects with -p)"))
