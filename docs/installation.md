# Installation in a Medusa application

Install the release tarball from README.md. Copy the three typed files from
examples/ into your app and change `../src/provider/service` imports to
`@lineapp/medusa-packeta` and `../src/client/types` to `@lineapp/medusa-packeta/client`.
Copy label-route.ts to `src/api/admin/shipping-labels/[id]/route.ts`.

Configure secrets in the deployment environment. `examples/provider-options.ts`
is the exact option contract and is typechecked in CI. `storeLabel` can instead
write to private S3-compatible storage; return an authenticated endpoint, not a
permanent public object URL. Use provider-specific URL/directory prefixes when
installing multiple carriers to prevent label-ID collisions.

Merge the provider into the existing module configuration:

```ts
import { options } from "./src/config/carrier-options"

// Inside defineConfig({ modules: [...] }):
{
  resolve: "@medusajs/medusa/fulfillment",
  options: {
    providers: [
      { resolve: "@lineapp/medusa-packeta", id: "packeta", options },
    ],
  },
}
```

Keep existing providers in this array. Run `pnpm medusa db:migrate` so Medusa
registers the provider. No custom schema migration is needed. Enable the provider
for the stock location, create a fulfillment set/service zone and add a flat-rate
shipping option using the option returned by `getFulfillmentOptions()`.
Provider identifier: `packeta_packeta`. Shipping option data:
`{ "id": "packeta-pickup" }`.

## Packing workflow

Medusa can delete a failed fulfillment and create a new ID on retry. Persist a
`shipping_operation_id` in your packing workflow before its first carrier call
and reuse it on retries, even when Medusa changes the fulfillment ID. Never create
a fresh operation ID merely to bypass an uncertain write. New physical parcels
need a new packing operation after the previous outcome is resolved. The provider
serializes writes per order and derives the carrier reference from that stable ID.
Pass measured parcels and an authoritative declared value in `additional_data`
from your authenticated packing action when running `createOrderFulfillmentWorkflow`:

```ts
additional_data: {
  shipping_operation_id: "persisted-packing-operation-id",
  packages: [{ reference: "parcel-1", weightGrams: 800,
    lengthMm: 250, widthMm: 180, heightMm: 60 }],
  declared_value_minor: 25000,
  currency_code: "CZK",
}
```

These are illustrative values, not production packing defaults. The values must
reflect the actual parcel and your service contract. Replace `buildShipment`
with a typed server-side mapper if you already have a packing system. Enforce
product-specific weight and dimension limits there before an external write.

In the storefront, initialize the official Packeta widget with its public widget key. Send only the selected ID as `data.pickup_point_id` when adding the shipping method. The provider revalidates it against Packeta and the cart country, then checks again before creating the packet.

## Before activation

Verify the native lifecycle with your own Medusa version, a provider test account,
private label download, repeated fulfillment and uncertain-operation recovery.
See acceptance.md and operations.md. Do not enable customer checkout just because
an API key is present.
