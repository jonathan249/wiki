#!/usr/bin/env bun
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { Command } from "effect/cli"
import { add } from "./commands/add"
import { current } from "./commands/current"
import { get } from "./commands/get"
import { list } from "./commands/list"
import { newProject } from "./commands/new"
import { reindex } from "./commands/reindex"
import { search } from "./commands/search"
import { use } from "./commands/use"
import { Index } from "./services/index"
import { Paths } from "./services/paths"
import { Search } from "./services/search"
import { State } from "./services/state"
import { Storage } from "./services/storage"

const wiki = Command.make("wiki").pipe(
    Command.withDescription("A tiny markdown wiki"),
    Command.withSubcommands([newProject, use, current, list, get, search, add, reindex]),
)

const AppLayer = Search.layer.pipe(
    Layer.provideMerge(Index.layer),
    Layer.provideMerge(Layer.mergeAll(State.layer, Storage.layer)),
    Layer.provideMerge(Paths.layer),
    Layer.provideMerge(NodeServices.layer),
)

wiki.pipe(
    Command.run({ version: "0.0.1" }),
    Effect.provide(AppLayer),
    NodeRuntime.runMain,
)
