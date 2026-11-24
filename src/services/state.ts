import { Context, Effect, FileSystem, Layer, Option, Path, Schema } from "effect"
import { NoCurrentProject } from "../errors"
import { Paths } from "./paths"

const StateFile = Schema.Struct({ currentProject: Schema.optional(Schema.String) })
type StateFile = typeof StateFile.Type

/** Persistent CLI state (the current project), stored as JSON on disk. */
export class State extends Context.Service<State, {
    readonly getCurrent: Effect.Effect<string, NoCurrentProject>
    readonly setCurrent: (project: string) => Effect.Effect<void>
}>()("wiki/State") {
    static readonly layer = Layer.effect(State, Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const { stateFile } = yield* Paths

        // A missing or corrupt state file is treated as empty state.
        const read: Effect.Effect<StateFile> = fs.readFileString(stateFile).pipe(
            Effect.flatMap((text) => Effect.try(() => JSON.parse(text) as unknown)),
            Effect.map(Schema.decodeUnknownOption(StateFile)),
            Effect.map(Option.getOrElse((): StateFile => ({}))),
            Effect.orElseSucceed((): StateFile => ({})),
        )

        const write = (state: StateFile) =>
            fs.makeDirectory(path.dirname(stateFile), { recursive: true }).pipe(
                Effect.andThen(fs.writeFileString(stateFile, JSON.stringify(state, null, 2) + "\n")),
                Effect.orDie,
            )

        return {
            getCurrent: read.pipe(Effect.flatMap((s) =>
                s.currentProject ? Effect.succeed(s.currentProject) : Effect.fail(new NoCurrentProject()),
            )),
            setCurrent: (project) => read.pipe(
                Effect.flatMap((s) => write({ ...s, currentProject: project })),
            ),
        }
    }))
}
