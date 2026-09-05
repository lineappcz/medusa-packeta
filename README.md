# Packeta for Medusa

[![CI](https://github.com/lineappcz/medusa-packeta/actions/workflows/ci.yml/badge.svg)](https://github.com/lineappcz/medusa-packeta/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Packeta pickup-point delivery: server-side point validation, packet creation, PDF A6 labels, authoritative tracking and external-carrier observations.

A typed API client and a native Medusa v2 **fulfillment provider**, maintained by LINEAPP.
No storefront, database schema or project-specific business rules are bundled.

## Compatibility and release status

- Node.js 22.12+; CI checks Node 22 and 24.
- Medusa 2.19.0 is the baseline; CI also checks 2.20.1.
- Version 0.1.0 has automated protocol, provider and real-Redis tests. A passing
  test suite is not a bank/carrier certification. [Scope and acceptance](docs/acceptance.md).
- Installable tarballs are distributed in [GitHub Releases](https://github.com/lineappcz/medusa-packeta/releases).
  The npm scope is declared in package metadata; npm publication is not claimed.

## Install

```sh
pnpm add https://github.com/lineappcz/medusa-packeta/releases/download/v0.1.0/lineapp-medusa-packeta-0.1.0.tgz
```

Register `@lineapp/medusa-packeta` under the existing Medusa `fulfillment` module's `providers`
array. Do not replace the other providers. See the complete
[configuration and application contract](docs/installation.md).

The API client is available separately:

```ts
import * as client from "@lineapp/medusa-packeta/client"
```

Use the client when an application already owns its persistent operation ledger
and workflows. The native provider includes a Redis operation journal. External
writes are reserved before I/O and uncertain operations block retries; a provider's
request identifier alone does not guarantee idempotency.

## What this release does not do

Address-delivery carriers, return labels, automated cancellation and live rate calculation are outside this release. Packeta has no separate sandbox: use a dedicated test sender and synthetic recipients.

Credentials, enabled carrier products, shipping prices and fulfillment packing
remain merchant configuration. Unsupported operations fail explicitly.

## Development

```sh
corepack enable
pnpm install --frozen-lockfile
docker compose up -d --wait
REDIS_TEST_URL=redis://127.0.0.1:16379 pnpm check
pnpm format:check
pnpm pack
docker compose down
```

Tests use synthetic data and generated RSA keys. They do not contact the bank or
carriers. Redis tests use unique namespaces and clean only their own keys.
Coverage is measured across client, provider and operation journal, with enforced
thresholds in `jest.config.cjs`. The CI artifact includes LCOV and a JSON summary.

## Documentation

- [Installation](docs/installation.md) and [runnable configuration examples](examples)
- [Architecture and extension boundaries](docs/architecture.md)
- [Operation recovery, storage and rollout](docs/operations.md)
- [Feature parity and acceptance](docs/acceptance.md)
- [Release process](docs/releases.md), [changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md), [security reporting](SECURITY.md)
- [AI agent instructions](AGENTS.md) and [documentation index](llms.txt)

Protocol reference: [Packeta official documentation](https://docs.packeta.com/docs/api-reference/api-methods).
Medusa: [module providers](https://docs.medusajs.com/resources/references/fulfillment/provider).
This is an independent community integration; carrier/bank trademarks remain
their owners' property and do not imply endorsement.
