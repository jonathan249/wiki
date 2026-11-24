// Compiles the CLI into a single executable at dist/wiki.
// The absolute path to this repo's projects/ folder is baked in, because a
// compiled binary can't locate it relative to its own source files.
// WIKI_PROJECTS_DIR still overrides it at runtime.
import { $ } from "bun"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const projectsDir = process.env.WIKI_PROJECTS_DIR ?? resolve(root, "projects")

await $`bun build ${resolve(root, "src/main.ts")} --compile --minify --sourcemap \
  --define ${`process.env.WIKI_DEFAULT_PROJECTS_DIR=${JSON.stringify(projectsDir)}`} \
  --outfile ${resolve(root, "dist/wiki")}`

console.log(`Built dist/wiki (projects: ${projectsDir})`)
