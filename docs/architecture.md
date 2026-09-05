# Architecture

`@lineapp/medusa-packeta` exposes two boundaries:

1. The root export registers a native Medusa fulfillment provider through
   `ModuleProvider`. It follows Medusa's published provider interface.
2. `/client` and `/client/*` expose protocol clients and types. Existing applications
   with their own persistent workflows can adopt these without replacing them.

No application-specific business policy or database model is exported. The host application retains those
business invariants. The initial implementation was extracted from LINEAPP's
maintained application and is released under MIT with independent versioning.

Transport owns wire formats, signing, parsing, status normalization and bounded
read retries. Native provider owns Medusa conversion and operation coordination.
Host workflows own authorization, item packing, product/service eligibility,
shipping prices, notifications and order completion.

## External writes

Redis reserves an operation and resource atomically before I/O. Fingerprints
detect conflicting reuse. Completed operations replay their result. Resource
state and result are committed together. Competing operations and interrupted
writes remain blocked. Reservations do not expire. All keys for one resource use
the same Redis cluster hash tag. No operation claims distributed exactly-once
execution: an ambiguous provider outcome requires operator reconciliation.

Provide an `OperationStore` implementation to use a different durable store.
Its atomicity, uniqueness, recovery and persistence must meet the same contract.
The included in-memory implementation is a test fixture only.

## Storage and privacy

Credentials stay in provider options loaded from deployment secrets. Logs and
errors never need raw bank responses or recipient details. Label bytes go to the
merchant's private storage callback; Medusa stores an authenticated label endpoint.
Do not return permanent public object URLs or long-lived bearer tokens as labels.

API clients have injected HTTP/clock seams for tests. Never use these seams to
disable verification in deployed applications. Runtime exports exclude fixtures.
