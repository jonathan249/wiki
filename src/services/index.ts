import { Context, Effect, FileSystem, Layer, Path } from "effect"
import MiniSearch, { type AsPlainObject, type Options } from "minisearch"
import { Paths } from "./paths"
import { Storage } from "./storage"

/** One indexed markdown page. `id` is `<project>/<page>`. */
interface PageDoc {
    readonly id: string
    readonly project: string
    readonly page: string
    readonly title: string
    readonly content: string
}

export interface IndexHit {
    readonly project: string
    readonly page: string
    readonly score: number
    /** Indexed terms that matched (after prefix/fuzzy expansion), lowercased. */
    readonly terms: ReadonlyArray<string>
}

export interface RefreshStats {
    readonly added: number
    readonly updated: number
    readonly removed: number
    readonly total: number
}

/** Bump when the index options or stored shape change; old files get rebuilt. */
const INDEX_VERSION = 1

const indexOptions: Options<PageDoc> = {
    fields: ["title", "content"],
    storeFields: ["project", "page"],
    searchOptions: { boost: { title: 3 }, prefix: true, fuzzy: 0.2 },
}

interface StoredIndex {
    readonly version: number
    /** id → change stamp (mtime:size) at the time it was indexed. */
    readonly stamps: Record<string, string>
    readonly index: AsPlainObject
}

const titleOf = (page: string) => page.replace(/[/_-]+/g, " ")

/**
 * Full-text index over all pages, persisted to `<projectsDir>/.wiki-index.json`.
 * Every query first syncs the index with the files on disk (by mtime + size),
 * so edits made outside the CLI are picked up automatically.
 */
export class Index extends Context.Service<Index, {
    readonly refresh: (options?: { readonly rebuild?: boolean }) => Effect.Effect<RefreshStats>
    readonly query: (
        query: string,
        options: { readonly projects: ReadonlyArray<string>; readonly limit: number },
    ) => Effect.Effect<ReadonlyArray<IndexHit>>
}>()("wiki/Index") {
    static readonly layer = Layer.effect(Index, Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const storage = yield* Storage
        const { projectsDir } = yield* Paths
        const indexFile = path.join(projectsDir, ".wiki-index.json")

        const empty = () => ({ search: new MiniSearch<PageDoc>(indexOptions), stamps: {} as Record<string, string> })

        // Missing, corrupt or outdated index files are rebuilt from scratch.
        const load = fs.readFileString(indexFile).pipe(
            Effect.flatMap((text) => Effect.try(() => {
                const stored = JSON.parse(text) as StoredIndex
                if (stored.version !== INDEX_VERSION) throw new Error("outdated index")
                return { search: MiniSearch.loadJS<PageDoc>(stored.index, indexOptions), stamps: { ...stored.stamps } }
            })),
            Effect.orElseSucceed(empty),
        )

        // Write to a temp file and rename, so a crash never leaves a half-written index.
        const save = (search: MiniSearch<PageDoc>, stamps: Record<string, string>) => {
            const stored: StoredIndex = { version: INDEX_VERSION, stamps, index: search.toJSON() }
            const tmp = `${indexFile}.${process.pid}.tmp`
            return fs.writeFileString(tmp, JSON.stringify(stored)).pipe(
                Effect.andThen(fs.rename(tmp, indexFile)),
                Effect.orDie,
            )
        }

        const sync = (rebuild: boolean) => Effect.gen(function* () {
            const state = rebuild ? empty() : yield* load
            const { search, stamps } = state

            // Current stamps of every page on disk.
            const projects = yield* storage.listProjects
            const current = new Map<string, { project: string; page: string; stamp: string }>()
            for (const project of projects) {
                const pageStamps = yield* storage.pageStamps(project).pipe(
                    Effect.orElseSucceed((): ReadonlyMap<string, string> => new Map()),
                )
                for (const [page, stamp] of pageStamps) current.set(`${project}/${page}`, { project, page, stamp })
            }

            let added = 0, updated = 0, removed = 0

            for (const id of Object.keys(stamps)) {
                if (!current.has(id)) {
                    if (search.has(id)) search.discard(id)
                    delete stamps[id]
                    removed++
                }
            }

            const changed = [...current.entries()].filter(([id, { stamp }]) => stamps[id] !== stamp)
            const docs = yield* Effect.forEach(changed, ([id, { project, page, stamp }]) =>
                storage.readPage(project, page).pipe(
                    Effect.map((content) => ({ doc: { id, project, page, title: titleOf(page), content }, stamp })),
                    Effect.option,
                ), { concurrency: 32 })

            for (const entry of docs) {
                if (entry._tag === "None") continue
                const { doc, stamp } = entry.value
                if (search.has(doc.id)) {
                    search.discard(doc.id)
                    updated++
                } else {
                    added++
                }
                search.add(doc)
                stamps[doc.id] = stamp
            }

            const dirty = rebuild || added + updated + removed > 0
            if (dirty) yield* save(search, stamps)
            return { search, stats: { added, updated, removed, total: search.documentCount } }
        })

        return {
            refresh: (options) => sync(options?.rebuild ?? false).pipe(Effect.map((r) => r.stats)),
            query: (query, { projects, limit }) => sync(false).pipe(Effect.map(({ search }) => {
                const allowed = new Set(projects)
                const filter = (r: { [key: string]: unknown }) => allowed.has(r.project as string)
                // Prefer pages matching every word; fall back to any word.
                let results = search.search(query, { combineWith: "AND", filter })
                if (results.length === 0) results = search.search(query, { combineWith: "OR", filter })
                return results.slice(0, limit).map((r): IndexHit => ({
                    project: r.project as string,
                    page: r.page as string,
                    score: r.score,
                    terms: r.terms,
                }))
            })),
        }
    }))
}
