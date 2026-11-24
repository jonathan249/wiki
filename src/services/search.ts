import { Context, Effect, Layer } from "effect"
import type { InvalidName, ProjectNotFound } from "../errors"
import { Index } from "./index"
import { Storage } from "./storage"

export interface LineHit {
    readonly line: number
    readonly text: string
}

export interface PageResult {
    readonly project: string
    readonly page: string
    /** Relevance score (ranked mode only; 0 for exact mode). */
    readonly score: number
    readonly lines: ReadonlyArray<LineHit>
}

export interface SearchOptions {
    readonly projects: ReadonlyArray<string>
    /** Max pages to return. */
    readonly limit: number
}

export class Search extends Context.Service<Search, {
    /** Ranked full-text search via the index (prefix + fuzzy, multi-word). */
    readonly ranked: (query: string, options: SearchOptions) => Effect.Effect<ReadonlyArray<PageResult>>
    /** Literal, case-insensitive substring scan over every page (no index). */
    readonly exact: (
        query: string,
        options: SearchOptions,
    ) => Effect.Effect<ReadonlyArray<PageResult>, ProjectNotFound | InvalidName>
}>()("wiki/Search") {
    static readonly layer = Layer.effect(Search, Effect.gen(function* () {
        const storage = yield* Storage
        const index = yield* Index

        const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

        // Ranked mode: a term matches at the start of a word ("date" hits
        // "date picker" but not "update"). Lines matching more distinct terms
        // come first, so "blocking overlay" shows lines with both words on top.
        const rankedLines = (content: string, terms: ReadonlyArray<string>): Array<LineHit> => {
            const patterns = [...new Set(terms)].map((t) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(t)}`, "iu"))
            return content.split("\n")
                .map((text, i) => ({ line: i + 1, text: text.trim(), hits: patterns.filter((p) => p.test(text)).length }))
                .filter((l) => l.hits > 0)
                .sort((a, b) => b.hits - a.hits || a.line - b.line)
                .map(({ line, text }) => ({ line, text }))
        }

        // Exact mode: plain case-insensitive substring, in file order.
        const exactLines = (content: string, needle: string): Array<LineHit> =>
            content.split("\n").flatMap((text, i): Array<LineHit> =>
                text.toLowerCase().includes(needle) ? [{ line: i + 1, text: text.trim() }] : [])

        const readOrEmpty = (project: string, page: string) =>
            storage.readPage(project, page).pipe(Effect.orElseSucceed(() => ""))

        return {
            ranked: (query, { projects, limit }) =>
                index.query(query, { projects, limit }).pipe(
                    Effect.flatMap(Effect.forEach((hit) =>
                        readOrEmpty(hit.project, hit.page).pipe(Effect.map((content): PageResult => ({
                            project: hit.project,
                            page: hit.page,
                            score: hit.score,
                            lines: rankedLines(content, hit.terms),
                        }))), { concurrency: 16 })),
                ),

            exact: (query, { projects, limit }) => {
                const needle = query.toLowerCase()
                return Effect.forEach(projects, (project) =>
                    storage.listPages(project).pipe(Effect.flatMap(Effect.forEach((page) =>
                        readOrEmpty(project, page).pipe(Effect.map((content): PageResult => ({
                            project,
                            page,
                            score: 0,
                            lines: exactLines(content, needle),
                        }))), { concurrency: 16 }))),
                ).pipe(Effect.map((nested) => nested.flat().filter((r) => r.lines.length > 0).slice(0, limit)))
            },
        }
    }))
}
