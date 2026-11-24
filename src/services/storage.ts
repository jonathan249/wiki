import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"
import { InvalidName, PageExists, PageNotFound, ProjectExists, ProjectNotFound } from "../errors"
import { Paths } from "./paths"

/** Reads and writes markdown pages under `projects/<project>/<page>.md`. */
export class Storage extends Context.Service<Storage, {
    readonly listProjects: Effect.Effect<ReadonlyArray<string>>
    readonly ensureProject: (project: string) => Effect.Effect<void, ProjectNotFound | InvalidName>
    readonly createProject: (project: string) => Effect.Effect<void, InvalidName | ProjectExists>
    /** Page names (without `.md`), including nested ones like `notes/today`. */
    readonly listPages: (project: string) => Effect.Effect<ReadonlyArray<string>, ProjectNotFound | InvalidName>
    /**
     * A change stamp per page (mtime + size). Used by the search index to
     * re-index only pages that changed since the last run.
     */
    readonly pageStamps: (project: string) => Effect.Effect<ReadonlyMap<string, string>, ProjectNotFound | InvalidName>
    readonly readPage: (project: string, page: string) => Effect.Effect<string, PageNotFound | ProjectNotFound | InvalidName>
    readonly writePage: (
        project: string,
        page: string,
        content: string,
        options?: { readonly append?: boolean },
    ) => Effect.Effect<string, PageExists | ProjectNotFound | InvalidName>
}>()("wiki/Storage") {
    static readonly layer = Layer.effect(Storage, Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const { projectsDir } = yield* Paths

        // Keep names inside projectsDir: no absolute paths, no "..".
        const validName = (name: string) =>
            /^[\w-]+(\/[\w-]+)*$/.test(name) ? Effect.succeed(name) : Effect.fail(new InvalidName({ name }))

        // Projects are a single folder name (pages may be nested, projects not).
        const validProject = (name: string) =>
            /^[\w-]+$/.test(name) ? Effect.succeed(name) : Effect.fail(new InvalidName({ name }))

        const projectDir = (project: string) => path.join(projectsDir, project)
        const pageFile = (project: string, page: string) =>
            path.join(projectDir(project), page.replace(/\.md$/, "") + ".md")

        const isDir = (p: string) => fs.stat(p).pipe(
            Effect.map((info) => info.type === "Directory"),
            Effect.orElseSucceed(() => false),
        )

        const listProjects = fs.readDirectory(projectsDir).pipe(
            Effect.flatMap(Effect.filter((name) => isDir(path.join(projectsDir, name)))),
            Effect.map((names) => names.filter((n) => !n.startsWith(".")).sort()),
            Effect.orElseSucceed((): ReadonlyArray<string> => []),
        )

        const ensureProject = (project: string) => validProject(project).pipe(
            Effect.andThen(isDir(projectDir(project))),
            Effect.flatMap((exists) => exists
                ? Effect.void
                : listProjects.pipe(Effect.flatMap((available) =>
                    Effect.fail(new ProjectNotFound({ project, available: [...available] }))))),
        )

        const listPages = (project: string) => ensureProject(project).pipe(
            Effect.andThen(fs.readDirectory(projectDir(project), { recursive: true }).pipe(Effect.orDie)),
            Effect.map((files) => files
                .filter((f) => f.endsWith(".md"))
                .map((f) => f.slice(0, -3).split(path.sep).join("/"))
                .sort()),
        )

        return {
            listProjects,
            listPages,
            pageStamps: (project) => listPages(project).pipe(
                Effect.flatMap(Effect.forEach((page) => fs.stat(pageFile(project, page)).pipe(
                    Effect.map((info) => [page, `${Option.getOrUndefined(info.mtime)?.getTime() ?? 0}:${info.size}`] as const),
                    Effect.option, // deleted between listing and stat → skip
                ), { concurrency: 32 })),
                Effect.map((entries) => new Map(entries.flatMap((e) => Option.isSome(e) ? [e.value] : []))),
            ),
            ensureProject,
            createProject: (project) => Effect.gen(function* () {
                yield* validProject(project)
                if (yield* isDir(projectDir(project))) {
                    return yield* Effect.fail(new ProjectExists({ project }))
                }
                yield* fs.makeDirectory(projectDir(project), { recursive: true }).pipe(Effect.orDie)
            }),
            readPage: (project, page) => ensureProject(project).pipe(
                Effect.andThen(validName(page.replace(/\.md$/, ""))),
                Effect.andThen(fs.readFileString(pageFile(project, page))),
                Effect.catchTag("PlatformError", () => Effect.fail(new PageNotFound({ project, page }))),
            ),
            writePage: (project, page, content, options) => Effect.gen(function* () {
                yield* ensureProject(project)
                yield* validName(page.replace(/\.md$/, ""))
                const file = pageFile(project, page)
                const exists = yield* fs.exists(file).pipe(Effect.orDie)
                const body = content.endsWith("\n") ? content : content + "\n"
                if (exists && !options?.append) {
                    return yield* Effect.fail(new PageExists({ project, page }))
                }
                yield* fs.makeDirectory(path.dirname(file), { recursive: true }).pipe(Effect.orDie)
                yield* (exists
                    ? fs.writeFileString(file, "\n" + body, { flag: "a" })
                    : fs.writeFileString(file, body)
                ).pipe(Effect.orDie)
                return file
            }),
        }
    }))
}
