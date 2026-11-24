import { Schema } from "effect"
import { CliError } from "effect/cli"

// Each error carries a `CliError.userMessage`, so `Command.run` prints it
// nicely instead of dumping a stack trace.

export class NoCurrentProject extends Schema.TaggedError<NoCurrentProject>()("NoCurrentProject", {}) {
    override get [CliError.userMessage]() {
        return "No project selected. Run `wiki use <project>` first."
    }
}

export class ProjectNotFound extends Schema.TaggedError<ProjectNotFound>()("ProjectNotFound", {
    project: Schema.String,
    available: Schema.Array(Schema.String),
}) {
    override get [CliError.userMessage]() {
        const list = this.available.length > 0 ? this.available.join(", ") : "(none)"
        return `Project "${this.project}" not found. Available: ${list}`
    }
}

export class PageNotFound extends Schema.TaggedError<PageNotFound>()("PageNotFound", {
    project: Schema.String,
    page: Schema.String,
}) {
    override get [CliError.userMessage]() {
        return `Page "${this.page}" not found in project "${this.project}".`
    }
}

export class PageExists extends Schema.TaggedError<PageExists>()("PageExists", {
    project: Schema.String,
    page: Schema.String,
}) {
    override get [CliError.userMessage]() {
        return `Page "${this.page}" already exists in "${this.project}". Use --append to add to it.`
    }
}

export class InvalidName extends Schema.TaggedError<InvalidName>()("InvalidName", {
    name: Schema.String,
}) {
    override get [CliError.userMessage]() {
        return `Invalid name "${this.name}". Use letters, numbers, "-" and "_" (pages may also use "/" for folders).`
    }
}

export class ProjectExists extends Schema.TaggedError<ProjectExists>()("ProjectExists", {
    project: Schema.String,
}) {
    override get [CliError.userMessage]() {
        return `Project "${this.project}" already exists. Run \`wiki use ${this.project}\` to switch to it.`
    }
}
