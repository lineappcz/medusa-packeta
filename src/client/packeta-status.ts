import { createHash } from "node:crypto"

import type { CarrierTrackingSnapshot, CarrierTrackingStatus } from "./types"

const STATUS_BY_CODE: Readonly<Record<string, CarrierTrackingStatus>> = {
  "1": "CREATED",
  "2": "IN_TRANSIT",
  "3": "IN_TRANSIT",
  "4": "IN_TRANSIT",
  "5": "OUT_FOR_DELIVERY",
  "6": "IN_TRANSIT",
  "7": "DELIVERED",
  "8": "UNKNOWN",
  "9": "EXCEPTION",
  "10": "RETURNED",
  "11": "CANCELLED",
  "12": "IN_TRANSIT",
  "13": "UNKNOWN",
  "14": "IN_TRANSIT",
  "15": "RETURNED",
  "16": "EXCEPTION",
  "17": "EXCEPTION",
  "18": "UNKNOWN",
  "19": "UNKNOWN",
  "20": "UNKNOWN",
  "21": "UNKNOWN",
  "22": "UNKNOWN",
  "23": "UNKNOWN",
  "24": "UNKNOWN",
  "25": "UNKNOWN",
  "26": "UNKNOWN",
  "27": "UNKNOWN",
  "28": "UNKNOWN",
  "29": "UNKNOWN",
  "30": "UNKNOWN",
  "31": "UNKNOWN",
  "999": "UNKNOWN",
}

const PHYSICAL_HANDOFF_CODES = new Set([
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "9",
  "10",
  "12",
  "14",
  "15",
  "16",
  "17",
])

const TERMINAL_CODES = new Set(["7", "10", "11"])

const addMinutes = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * 60_000)

export const mapPacketaStatusCode = (
  statusCode: string,
): CarrierTrackingStatus => STATUS_BY_CODE[statusCode] ?? "UNKNOWN"

export const packetaStatusNeedsAlert = (statusCode: string): boolean =>
  mapPacketaStatusCode(statusCode) === "UNKNOWN"

export const packetaStatusProvesPhysicalHandoff = (
  statusCode: string,
): boolean => PHYSICAL_HANDOFF_CODES.has(statusCode)

export const isTerminalPacketaStatus = (statusCode: string): boolean =>
  TERMINAL_CODES.has(statusCode)

export const nextPacketaPollAt = ({
  statusCode,
  referenceAt,
}: {
  statusCode: string
  referenceAt: Date
}): Date | null => {
  if (isTerminalPacketaStatus(statusCode)) {
    return null
  }

  if (statusCode === "6") {
    return addMinutes(referenceAt, 8 * 60)
  }

  if (statusCode === "1" || statusCode === "999") {
    return addMinutes(referenceAt, 30)
  }

  if (["9", "16", "17"].includes(statusCode)) {
    return addMinutes(referenceAt, 60)
  }

  return addMinutes(referenceAt, 15)
}

export const nextPacketaFailurePollAt = ({
  failureCount,
  referenceAt,
}: {
  failureCount: number
  referenceAt: Date
}): Date => {
  const exponent = Math.max(0, Math.min(5, failureCount - 1))
  return addMinutes(referenceAt, Math.min(15 * 2 ** exponent, 6 * 60))
}

export const packetaTrackingEventId = ({
  carrierShipmentId,
  statusCode,
  occurredAt,
}: {
  carrierShipmentId: string
  statusCode: string
  occurredAt: string
}): string =>
  `packeta_${createHash("sha256")
    .update(`${carrierShipmentId}:${statusCode}:${occurredAt}`)
    .digest("hex")
    .slice(0, 32)}`

export const fakePacketaTrackingSnapshot = (
  value: Omit<CarrierTrackingSnapshot, "provider" | "eventId"> & {
    eventId?: string
  },
): CarrierTrackingSnapshot => ({
  ...value,
  provider: "packeta",
  eventId:
    value.eventId ??
    packetaTrackingEventId({
      carrierShipmentId: value.carrierShipmentId,
      statusCode: value.rawStatus,
      occurredAt: value.occurredAt,
    }),
})
