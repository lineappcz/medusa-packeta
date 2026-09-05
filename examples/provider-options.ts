import type { PacketaProviderOptions } from "../src/provider/service"
import type { CarrierPackage } from "../src/client/types"
import { storeLabel } from "./private-labels"

// Copy into your Medusa app and change imports to @lineapp/medusa-packeta.
// Supply measured parcel data from an authenticated packing workflow through
// additional_data.packages. Do not forward a shopper's unvalidated JSON here.
export const options: PacketaProviderOptions = {
  apiPassword: process.env.PACKETA_API_PASSWORD!,
  senderIndication: process.env.PACKETA_SENDER!,
  widgetApiKey: process.env.PACKETA_WIDGET_KEY!,
  namespace: process.env.CARRIER_OPERATION_NAMESPACE!,
  redisUrl: process.env.CARRIER_OPERATION_REDIS_URL!,
  storeLabel,
  buildShipment: async (data, _items, order, fulfillment, additional) => {
    const address = fulfillment.delivery_address
    const packages = additional?.packages as CarrierPackage[] | undefined
    if (!address || !Array.isArray(packages) || !packages.length) {
      throw new Error(
        "Provide a delivery address and measured parcels from your packing workflow",
      )
    }
    const shipper = {
      name: process.env.SHIPPER_NAME!,
      streetLines: [process.env.SHIPPER_STREET!],
      city: process.env.SHIPPER_CITY!,
      postalCode: process.env.SHIPPER_POSTAL_CODE!,
      countryCode: process.env.SHIPPER_COUNTRY!,
      phone: process.env.SHIPPER_PHONE!,
      email: process.env.SHIPPER_EMAIL!,
    }
    return {
      idempotencyKey: "assigned-by-provider",
      externalReference: String(fulfillment.id),
      serviceCode: "configured-by-provider",
      shipper,
      recipient: {
        name: [address.first_name, address.last_name].filter(Boolean).join(" "),
        company: address.company ?? undefined,
        streetLines: [address.address_1, address.address_2].filter(
          (v): v is string => Boolean(v),
        ),
        city: address.city ?? "",
        postalCode: address.postal_code ?? "",
        countryCode: address.country_code ?? "",
        phone: address.phone ?? undefined,
        email: order?.email,
      },
      packages,
      pickupPointCode: String(data.pickup_point_id ?? ""),
      // Insurance is a merchant decision. Supply an authoritative amount from
      // your server-side order/packing workflow; this example never invents one.
      declaredValueMinor: Number(additional?.declared_value_minor),
      currencyCode: String(additional?.currency_code ?? ""),
      labelFormat: "PDF_A6",
    }
  },
}
