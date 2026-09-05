# Contributing

Start with an issue describing the use case, provider documentation and expected
behavior. Reproduce bugs with synthetic fixtures. Never attach secrets or labels
containing real addresses. Small pull requests are easier to review.

Use Node 22+, Corepack and the pinned pnpm. `pnpm check` runs types, lint, coverage
and build. The Redis URL must refer to a local/CI test instance. `pnpm format:check`
checks formatting. Include failing-before/passing-after tests for behavioral fixes.

Public option/type changes require docs, an example and a changelog entry. Keep
backward compatibility within a minor release during 0.x. Label breaking changes.
Use Conventional Commits (`fix:`, `feat:`, `docs:`, `test:`).

Maintainers review API contracts, uncertain-write behavior, privacy, package
contents and compatibility. Release from protected main only after CI passes.
Contributions are licensed under MIT. Treat contributors respectfully; explain
technical disagreements with evidence and stop unwanted personal contact.
