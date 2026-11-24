import { Console, Effect } from "effect"
import { Command } from "effect/cli"
import { State } from "../services/state"

export const current = Command.make("current", {}, () => Effect.gen(function* () {
    yield* Console.log(yield* (yield* State).getCurrent)
})).pipe(Command.withDescription("Show the current project"))
