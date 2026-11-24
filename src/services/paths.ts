import { Context, Effect, Layer, Path } from "effect"
import { homedir } from "node:os"

/**
 * Where things live on disk.
 * - projectsDir: `$WIKI_PROJECTS_DIR`, the path baked in at build time, or `projects/` at the repo root
 * - stateFile:   `$WIKI_STATE_FILE`, or `~/.config/wiki/state.json`
 */
export class Paths extends Context.Service<Paths, {
    readonly projectsDir: string
    readonly stateFile: string
}>()("wiki/Paths") {
    static readonly layer = Layer.effect(Paths, Effect.gen(function* () {
        const path = yield* Path.Path
        return {
            projectsDir: process.env.WIKI_PROJECTS_DIR
                // Baked in by scripts/build.ts for the compiled binary.
                ?? process.env.WIKI_DEFAULT_PROJECTS_DIR
                ?? path.resolve(import.meta.dir, "..", "..", "projects"),
            stateFile: process.env.WIKI_STATE_FILE
                ?? path.join(homedir(), ".config", "wiki", "state.json"),
        }
    }))
}
