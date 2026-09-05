import type {
  CarrierAddress,
  CarrierTrackingEvent,
  CreateCarrierShipmentCommand,
} from "../src/client/types"

export const carrierAddress = (name: string): CarrierAddress => ({
  name,
  streetLines: ["Testovací 1"],
  city: "Praha",
  postalCode: "110 00",
  countryCode: "CZ",
  email: "safe@example.test",
  phone: "+420000000000",
})

export const shipmentCommand = (): CreateCarrierShipmentCommand => ({
  idempotencyKey: "carrier:test:shipment:0001",
  externalReference: "EXAMPLE-ORDER-0001",
  serviceCode: "HOME",
  shipper: carrierAddress("Tiskárna"),
  recipient: carrierAddress("Zákazník"),
  packages: [{ reference: "PKG-1", weightGrams: 1_250 }],
  pickupPointCode: "52",
  declaredValueMinor: 12_500,
  currencyCode: "CZK",
  codValueMinor: 0,
  labelFormat: "PDF_A6",
})

export const deliveredEvent = (): CarrierTrackingEvent => ({
  provider: "packeta",
  eventId: "evt_delivery_001",
  payloadHash: "a".repeat(64),
  carrierShipmentId: "packet-1",
  trackingNumber: "Z1234567890",
  status: "DELIVERED",
  rawStatus: "delivered",
  occurredAt: "2026-08-31T12:00:00.000Z",
})
