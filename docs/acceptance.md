# Scope, parity and acceptance

## Automated release gate

Every release runs type checking (including configuration examples), Medusa's
recommended lint rules, Jest with coverage thresholds, a TypeScript declaration
build, formatting and packed-provider/client import smoke tests. CI exercises
Node 22/24 and Medusa 2.19.0/2.20.1. See the exact release commit's Actions run and
coverage artifact for evidence. No percentage is a claim of semantic completeness.

## Extraction and ownership

The protocol client was extracted from a working application integration. The
application's custom order, legal, production and database-ledger logic is outside
the package. Existing consumers can adopt the `/client` exports without replacing
their durable workflows. New Medusa apps can register the native provider.

| Capability                            | Public client | Native provider              | Host application                          |
| ------------------------------------- | ------------- | ---------------------------- | ----------------------------------------- |
| Protocol request/response validation  | Yes           | Uses client                  | Supplies authoritative input              |
| Credentials and environment selection | Yes           | Startup configuration        | Supplies own account secrets              |
| Status reads and conservative mapping | Yes           | Lifecycle integration        | Schedules recovery/polling                |
| External write reservation            | Caller-owned  | Persistent operation journal | Provides durable Redis or OperationStore  |
| Business-specific order rules         | No            | No                           | Retains its own workflows                 |
| Unknown write outcome recovery        | Typed failure | Blocks retries               | Operator reconciles authoritative records |

## Packeta

- Retained: XML createPacket, exact minor-unit value conversion, one parcel per
  request, authoritative PUDO validation, packetStatus and external-carrier
  observations, stable event IDs and polling policy helpers.
- Added: native fulfillment provider, packetLabelPdf download, private PDF storage
  callback, stable order-level journal and checkout PUDO validation.
- Caller-owned: shipment polling job, physical-handoff workflow, flat shipping
  prices, measured packing data and authenticated label delivery.
- Outside 0.1: home delivery, automatic cancellation, returns and dynamic rates.

Merchant acceptance: use a dedicated test sender/account (Packeta does not provide
an isolated sandbox), create an authorized test parcel, validate PDF, re-read
status and confirm physical handoff behavior. A generated label is not delivery.

## Evidence limits

Automated tests use synthetic provider responses, real cryptographic signatures
where applicable and a real local/CI Redis with isolated test namespaces. They do
not contact carrier/bank accounts and are not live-provider certification. Host
application adoption and live merchant acceptance are separate release evidence.
