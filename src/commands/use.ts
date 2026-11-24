import { Console, Effect } from "effect"
import { Argument, Command } from "effect/cli"
import { State } from "../services/state"
import { Storage } from "../services/storage"

export const use = Command.make("use", {
    project: Argument.String("project").pipe(Argument.withDescription("Project folder name in projects/")),
}, ({ project }) => Effect.gen(function* () {
    yield* (yield* Storage).ensureProject(project)
    yield* (yield* State).setCurrent(project)
    yield* Console.log(`Now using project "${project}"`)
})).pipe(Command.withDescription("Set the current project"))
