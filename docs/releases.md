# Releases

Use SemVer. During 0.x, breaking changes increment the minor version; compatible
fixes increment patch. Update CHANGELOG.md and package.json in a reviewed PR.
Do not edit generated lockfiles manually.

CI validates types, Medusa lint, all-source coverage, Node/Medusa compatibility and
the packed module. Release only the exact protected-main commit that passed CI.
Tag `v<package.version>` and run the release workflow; it rebuilds and tests the
archive, publishes a GitHub Release, tarball and SHA256SUMS. Existing tags/releases
must not be overwritten. Installers can pin the release tarball and verify its hash.

The published tarball contains compiled JavaScript, declarations and public docs.
No fixtures, secrets, source checkout or application data is distributed.
GitHub Actions are pinned by commit; Dependabot proposes updates for review.
Required CI and review apply to contributions; the maintainer manages releases.

Optional npm publishing requires ownership of `@lineapp`, a trusted publisher
bound to this repository and a separate reviewed workflow with OIDC provenance.
Until configured, GitHub Releases are the supported package channel. Do not tell
users that `pnpm add @lineapp/medusa-packeta` resolves from npm.
