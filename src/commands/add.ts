import { Console, Effect, Option, Stdio, Stream } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { State } from "../services/state"
import { Storage } from "../services/storage"

// Read piped input, e.g. `echo "hi" | wiki add notes`. Empty if stdin is a terminal.
const readStdin = Effect.gen(function* () {
    const stdio = yield* Stdio.Stdio
    if (yield* stdio.stdinIsTerminal) return ""
    return yield* stdio.stdin.pipe(Stream.decodeText(), Stream.mkString, Effect.orDie)
})

export const add = Command.make("add", {
    page: Argument.String("page").pipe(Argument.withDescription("Page name, e.g. `ideas` or `notes/today`")),
    content: Flag.String("content").pipe(Flag.withAlias("c"), Flag.optional, Flag.withDescription("Content to write (otherwise read from stdin)")),
    append: Flag.Boolean("append").pipe(Flag.withDefault(false), Flag.withDescription("Append if the page already exists")),
}, ({ page, content, append }) => Effect.gen(function* () {
    const body = Option.isSome(content) ? content.value : yield* readStdin
    if (body.trim() === "") {
        return yield* Console.error("Nothing to add. Pass --content \"...\" or pipe text via stdin.")
    }
    const project = yield* (yield* State).getCurrent
    const file = yield* (yield* Storage).writePage(project, page, body, { append })
    yield* Console.log(`${append ? "Updated" : "Wrote"} ${file}`)
})).pipe(Command.withDescription("Add a page to the current project"))
