# Operations and recovery

## Durable operation store

Use a dedicated persistent Redis, not an evicting cache: AOF enabled,
`appendfsync always`, `maxmemory-policy noeviction`, protected network and tested
backups. Replication and failover can lose recently acknowledged writes; after
restore/failover freeze external mutations and reconcile provider records before
resuming. Losing the journal can cause duplicate external operations.

Give each shop, environment and merchant account a unique namespace. Preserve it
across deploys. Never change credentials/accounts while reusing another merchant's
namespace. Never expire pending records or flush the database during operation.

## Pending/unknown operations

An error after reservation leaves the resource blocked. This includes process
death, network timeout, invalid response and persistence failure after acceptance.
Do not click retry with a new key and do not delete the lock on a timer.

1. Pause mutations for the affected resource. Record the operation key, expected
   amount/reference and incident ID without including private payloads in tickets.
2. Read the provider's authoritative record in its portal/API; compare merchant,
   reference, amount, shipment ID and time. Absence from a delayed listing is not
   evidence that a write failed.
3. Reconcile the operation, resource state and Medusa record under exclusive
   maintenance access. A successful write must be recorded as completed with its
   original result. A retry is permitted only after definitive evidence of no write.
4. Record who reconciled it, the evidence and time. Resume only that resource.

Redis keys: `<namespace>:{sha256(resource)}:op:<sha256(operation)>`, `:lock`,
`:state`. Operation JSON stores `status`, `fingerprint` and completed `result`.
The lock has an owner token. Never edit one field in isolation while workers run.
There is deliberately no unauthenticated reset endpoint.

## Rollout

Use synthetic fixtures locally, then provider test credentials/account and finally
an authorized production acceptance. Verify a complete Medusa lifecycle, not only
an HTTP 200. Confirm declined/invalid data, ambiguous timeout, duplicate submission,
label storage errors and callbacks/status reads. Keep a known-good package version
and journal backups. Rollback must preserve operation identities and state.

Live credentials and provider certification are merchant-specific prerequisites;
this repository does not contain or claim them. See acceptance.md.
