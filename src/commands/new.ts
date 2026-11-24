import { Console, Effect } from "effect"
import { Argument, Command } from "effect/cli"
import { State } from "../services/state"
import { Storage } from "../services/storage"

export const newProject = Command.make("new", {
    project: Argument.String("project").pipe(Argument.withDescription("Name of the project to create")),
}, ({ project }) => Effect.gen(function* () {
    yield* (yield* Storage).createProject(project)
    yield* (yield* State).setCurrent(project)
    yield* Console.log(`Created project "${project}" and switched to it`)
})).pipe(Command.withDescription("Create a new project and make it current"))
