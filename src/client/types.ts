export const CARRIER_CODES = ["packeta", "dpd", "dhl"] as const

export type CarrierCode = (typeof CARRIER_CODES)[number]

export type CarrierTrackingStatus =
  | "CREATED"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "EXCEPTION"
  | "RETURNED"
  | "CANCELLED"
  | "UNKNOWN"

export type CarrierAddress = {
  name: string
  company?: string
  streetLines: string[]
  city: string
  postalCode: string
  countryCode: string
  email?: string
  phone?: string
}

export type CarrierPackage = {
  reference: string
  weightGrams: number
  lengthMm?: number
  widthMm?: number
  heightMm?: number
}

export type CreateCarrierShipmentCommand = {
  idempotencyKey: string
  externalReference: string
  serviceCode: string
  shipper: CarrierAddress
  recipient: CarrierAddress
  packages: CarrierPackage[]
  pickupPointCode?: string
  declaredValueMinor: number
  currencyCode: string
  codValueMinor?: number
  labelFormat?: "PDF_A4" | "PDF_A6" | "ZPL"
}

export type CarrierLabelReference = {
  reference: string
  format: "PDF_A4" | "PDF_A6" | "ZPL"
  expiresAt?: string
}

export type CarrierShipment = {
  provider: CarrierCode
  carrierShipmentId: string
  trackingNumber: string
  trackingUrl?: string
  label?: CarrierLabelReference
}

export type CarrierTrackingEvent = {
  provider: CarrierCode
  eventId: string
  payloadHash: string
  carrierShipmentId?: string
  trackingNumber?: string
  status: CarrierTrackingStatus
  rawStatus: string
  occurredAt: string
}

export interface CarrierAdapter {
  readonly provider: CarrierCode
  readonly isConfigured: boolean

  createShipment(
    command: CreateCarrierShipmentCommand,
  ): Promise<CarrierShipment>
}

export type CarrierExternalTrackingObservation = {
  observedAt: string
  observationHash: string
  statusCode: string
}

export type CarrierTrackingSnapshot = {
  provider: CarrierCode
  carrierShipmentId: string
  eventId: string
  status: CarrierTrackingStatus
  rawStatus: string
  occurredAt: string
  externalObservation?: CarrierExternalTrackingObservation
  externalObservationErrorCode?: string
}

export interface CarrierTrackingAdapter extends CarrierAdapter {
  getTrackingStatus(carrierShipmentId: string): Promise<CarrierTrackingSnapshot>
}

export const isCarrierTrackingAdapter = (
  adapter: CarrierAdapter,
): adapter is CarrierTrackingAdapter =>
  "getTrackingStatus" in adapter &&
  typeof (adapter as CarrierTrackingAdapter).getTrackingStatus === "function"

export type CarrierShipmentIdempotencyRecord = {
  idempotencyKey: string
  requestFingerprint: string
  shipment: CarrierShipment
}

export interface CarrierShipmentIdempotencyStore {
  find(idempotencyKey: string): Promise<CarrierShipmentIdempotencyRecord | null>
  saveIfAbsent(
    record: CarrierShipmentIdempotencyRecord,
  ): Promise<CarrierShipmentIdempotencyRecord>
}

export type CarrierFetch = typeof fetch
