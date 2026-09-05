# Agent instructions

This repository publishes `@lineapp/medusa-packeta` for Medusa v2. Read README.md,
docs/architecture.md and docs/acceptance.md before changing public contracts.

- Package manager: pnpm 10.11.1 via Corepack. Never hand-edit pnpm-lock.yaml.
- `src/client`: provider protocol, standalone from Medusa business logic.
- `src/provider`: Medusa registration, conversion and persistent operation journal.
- `tests`: synthetic fixtures; RSA keys are generated at runtime.
- Run `pnpm check` with REDIS_TEST_URL for an isolated Redis, then `pnpm format:check`.
- Run `pnpm build` and inspect `pnpm pack` before a release. Test packed imports.
- No credentials, tenant configuration, private customer data or local paths in Git.
- Never retry an uncertain bank or shipment creation. Never delete a reservation
  merely because a timeout elapsed. Read docs/operations.md.
- Money in Medusa uses major units; conversion to API minor units occurs at the
  provider boundary using exact decimal arithmetic, never floating-point rounding.
- Preserve the module provider interface. Register under the existing payment or
  fulfillment module. Route mutations belong to Medusa workflows in the host app.
- Fetch current primary documentation before changing provider wire formats.
- A protocol fixture test is not a live provider certification. Record evidence
  honestly; do not claim untested Medusa versions or unavailable features.
- No automatic bank/carrier calls in unit tests or default development commands.
- Do not lower coverage thresholds to pass CI. Add a test for the missing behavior.
- Conventional commits, SemVer, no generated dist in Git, no unrelated refactors.
