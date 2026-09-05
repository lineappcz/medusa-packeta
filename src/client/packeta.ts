import { createHash } from "node:crypto"

import {
  asCarrierIntegrationError,
  CarrierIntegrationError,
  carrierInvariant,
} from "./errors"
import { requestCarrierText } from "./http-client"
import { mapPacketaStatusCode, packetaTrackingEventId } from "./packeta-status"
import type {
  CarrierFetch,
  CarrierShipment,
  CarrierTrackingAdapter,
  CarrierTrackingSnapshot,
  CreateCarrierShipmentCommand,
} from "./types"

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")

const xmlElement = (name: string, value?: string | number): string =>
  value === undefined || value === ""
    ? ""
    : `<${name}>${escapeXml(String(value))}</${name}>`

const splitName = (value: string): { name: string; surname: string } => {
  const parts = value.trim().split(/\s+/)
  if (parts.length === 1) {
    return { name: parts[0], surname: "-" }
  }

  return {
    name: parts.slice(0, -1).join(" "),
    surname: parts.at(-1) as string,
  }
}

const decodeXml = (value: string): string =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")

const xmlValues = (xml: string, name: string): string[] => {
  const values: string[] = []
  const pattern = new RegExp(
    `<(?:[A-Za-z0-9_-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${name}>`,
    "gi",
  )
  for (const match of xml.matchAll(pattern)) {
    values.push(decodeXml(match[1].trim()))
  }
  return values
}

const assertSuccessfulXml = (xml: string): void => {
  if (/<fault[>\s]/i.test(xml) || /<status>fault<\/status>/i.test(xml)) {
    throw new CarrierIntegrationError({
      code: "PACKETA_REQUEST_REJECTED",
      message: "Packeta rejected the packet creation request.",
    })
  }
}

const packetDetailFromXml = (
  xml: string,
): { packetId: string; barcode: string } => {
  assertSuccessfulXml(xml)

  const packetId = xmlValues(xml, "id").at(-1)
  const barcode = xmlValues(xml, "barcode").at(-1)
  carrierInvariant(
    packetId && /^\d{1,20}$/.test(packetId),
    "PACKETA_RESPONSE_INCOMPLETE",
    "Packeta response is missing a packet identifier.",
    "UNKNOWN",
  )
  carrierInvariant(
    barcode && /^Z\d{1,20}$/.test(barcode),
    "PACKETA_RESPONSE_INCOMPLETE",
    "Packeta response is missing a packet barcode.",
    "UNKNOWN",
  )
  return { packetId, barcode }
}

const exactMoney = (minor: number): string => {
  carrierInvariant(
    Number.isSafeInteger(minor) && minor >= 0,
    "PACKETA_MONETARY_VALUE_INVALID",
    "Packeta monetary values must use non-negative integer minor units.",
  )
  return (minor / 100).toFixed(2)
}

const packetaLocalTimestampToIso = (value: string): string => {
  carrierInvariant(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value),
    "PACKETA_TRACKING_TIMESTAMP_INVALID",
    "Packeta tracking timestamp is invalid.",
    "UNKNOWN",
  )
  const [datePart, timePart] = value.split("T")
  const [year, month, day] = datePart.split("-").map(Number)
  const [hour, minute, second] = timePart.split(":").map(Number)
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(targetAsUtc))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  )
  const renderedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  const offset = renderedAsUtc - targetAsUtc
  return new Date(targetAsUtc - offset).toISOString()
}

const buildCreatePacketXml = ({
  command,
  apiPassword,
  senderIndication,
}: {
  command: CreateCarrierShipmentCommand
  apiPassword: string
  senderIndication: string
}): string => {
  const recipient = splitName(command.recipient.name)
  const packet = command.packages[0]
  carrierInvariant(
    command.pickupPointCode && /^\d{1,20}$/.test(command.pickupPointCode),
    "PACKETA_PICKUP_POINT_REQUIRED",
    "Packeta packet creation requires a server-verified PUDO address ID.",
  )
  carrierInvariant(
    command.recipient.email && command.recipient.phone,
    "PACKETA_RECIPIENT_CONTACT_REQUIRED",
    "Packeta packet creation requires recipient email and phone.",
  )
  const currency = command.currencyCode.trim().toUpperCase()
  carrierInvariant(
    /^[A-Z]{3}$/.test(currency),
    "PACKETA_CURRENCY_INVALID",
    "Packeta currency code is invalid.",
  )

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<createPacket>",
    xmlElement("apiPassword", apiPassword),
    "<packetAttributes>",
    xmlElement("number", command.externalReference),
    xmlElement("name", recipient.name),
    xmlElement("surname", recipient.surname),
    xmlElement("company", command.recipient.company),
    xmlElement("email", command.recipient.email),
    xmlElement("phone", command.recipient.phone),
    xmlElement("addressId", command.pickupPointCode),
    xmlElement("cod", exactMoney(command.codValueMinor ?? 0)),
    xmlElement("value", exactMoney(command.declaredValueMinor)),
    xmlElement("currency", currency),
    xmlElement("weight", packet.weightGrams / 1_000),
    xmlElement("eshop", senderIndication),
    "</packetAttributes>",
    "</createPacket>",
  ].join("")
}

const buildTrackingXml = ({
  method,
  apiPassword,
  packetId,
}: {
  method: "packetStatus" | "packetCourierTracking"
  apiPassword: string
  packetId: string
}): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<${method}>`,
    xmlElement("apiPassword", apiPassword),
    xmlElement("packetId", packetId),
    `</${method}>`,
  ].join("")

const parseExternalObservation = (xml: string, observedAt: string) => {
  assertSuccessfulXml(xml)
  const statusCode = xmlValues(xml, "statusCode").at(-1)
  const occurredAtValue = xmlValues(xml, "dateTime").at(-1)
  if (!statusCode || !occurredAtValue) {
    return undefined
  }
  const carrierClass = xmlValues(xml, "carrierClass").at(-1) ?? "unknown"
  return {
    observedAt,
    statusCode,
    observationHash: createHash("sha256")
      .update(`${carrierClass}:${statusCode}:${occurredAtValue}`)
      .digest("hex"),
  }
}

export class PacketaHttpAdapter implements CarrierTrackingAdapter {
  readonly provider = "packeta" as const
  readonly isConfigured = true

  constructor(
    private readonly config: {
      endpoint: string
      apiPassword: string
      senderIndication: string
      fetchImpl?: CarrierFetch
      timeoutMs?: number
      now?: () => Date
    },
  ) {
    carrierInvariant(
      Boolean(config.apiPassword.trim()) &&
        Boolean(config.senderIndication.trim()),
      "PACKETA_CONFIG_INVALID",
      "Packeta password and sender indication are required.",
    )
    carrierInvariant(
      config.endpoint === "https://www.zasilkovna.cz/api/rest" ||
        Boolean(config.fetchImpl),
      "PACKETA_ENDPOINT_INVALID",
      "Use the official Packeta REST endpoint.",
    )
  }

  async getLabel(packetId: string): Promise<Buffer> {
    carrierInvariant(
      /^\d{1,20}$/.test(packetId),
      "PACKETA_PACKET_ID_INVALID",
      "Packet ID is invalid.",
    )
    const xml = await requestCarrierText({
      fetchImpl: this.config.fetchImpl,
      url: this.config.endpoint,
      method: "POST",
      headers: {
        "content-type": "application/xml; charset=utf-8",
        accept: "application/xml",
      },
      body: `<?xml version="1.0"?><packetLabelPdf>${xmlElement("apiPassword", this.config.apiPassword)}${xmlElement("packetId", packetId)}${xmlElement("format", "A6 on A6")}${xmlElement("offset", 0)}</packetLabelPdf>`,
      maxAttempts: 3,
      timeoutMs: this.config.timeoutMs,
    })
    assertSuccessfulXml(xml)
    const result = xmlValues(xml, "result").at(-1) ?? ""
    carrierInvariant(
      result.length <= 14_000_000 && /^[A-Za-z0-9+/\s]+={0,2}$/.test(result),
      "PACKETA_LABEL_INVALID",
      "Packeta label response is invalid.",
      "UNKNOWN",
    )
    const content = Buffer.from(result, "base64")
    carrierInvariant(
      content.subarray(0, 5).toString() === "%PDF-",
      "PACKETA_LABEL_INVALID",
      "Packeta did not return a PDF.",
      "UNKNOWN",
    )
    return content
  }

  async createShipment(
    command: CreateCarrierShipmentCommand,
  ): Promise<CarrierShipment> {
    carrierInvariant(
      command.packages.length === 1,
      "PACKETA_SINGLE_PACKAGE_REQUIRED",
      "Packeta createPacket accepts exactly one package per request.",
    )

    carrierInvariant(
      Number.isSafeInteger(command.packages[0].weightGrams) &&
        command.packages[0].weightGrams > 0,
      "PACKETA_WEIGHT_INVALID",
      "Packeta parcel weight must be a positive integer in grams.",
    )
    const response = await requestCarrierText({
      fetchImpl: this.config.fetchImpl,
      url: this.config.endpoint,
      method: "POST",
      headers: {
        accept: "application/xml, text/xml",
        "content-type": "application/xml; charset=utf-8",
      },
      body: buildCreatePacketXml({
        command,
        apiPassword: this.config.apiPassword,
        senderIndication: this.config.senderIndication,
      }),
      timeoutMs: this.config.timeoutMs,
      maxAttempts: 1,
    })
    const packet = packetDetailFromXml(response)

    return {
      provider: this.provider,
      carrierShipmentId: packet.packetId,
      trackingNumber: packet.barcode,
      trackingUrl: `https://tracking.packeta.com/cs/?id=${encodeURIComponent(packet.barcode)}`,
    }
  }

  async getTrackingStatus(
    carrierShipmentId: string,
  ): Promise<CarrierTrackingSnapshot> {
    carrierInvariant(
      /^\d{1,20}$/.test(carrierShipmentId),
      "PACKETA_PACKET_ID_INVALID",
      "Packeta packet ID is invalid.",
    )
    const response = await requestCarrierText({
      fetchImpl: this.config.fetchImpl,
      url: this.config.endpoint,
      method: "POST",
      headers: {
        accept: "application/xml, text/xml",
        "content-type": "application/xml; charset=utf-8",
      },
      body: buildTrackingXml({
        method: "packetStatus",
        apiPassword: this.config.apiPassword,
        packetId: carrierShipmentId,
      }),
      timeoutMs: this.config.timeoutMs,
      maxAttempts: 3,
    })
    assertSuccessfulXml(response)
    const statusCode = xmlValues(response, "statusCode").at(-1)
    const occurredAtValue = xmlValues(response, "dateTime").at(-1)
    carrierInvariant(
      statusCode && /^\d{1,3}$/.test(statusCode) && occurredAtValue,
      "PACKETA_TRACKING_RESPONSE_INCOMPLETE",
      "Packeta tracking response is incomplete.",
      "UNKNOWN",
    )
    const occurredAt = packetaLocalTimestampToIso(occurredAtValue)
    const snapshot: CarrierTrackingSnapshot = {
      provider: this.provider,
      carrierShipmentId,
      eventId: packetaTrackingEventId({
        carrierShipmentId,
        statusCode,
        occurredAt,
      }),
      status: mapPacketaStatusCode(statusCode),
      rawStatus: statusCode,
      occurredAt,
    }

    if (statusCode !== "6") {
      return snapshot
    }

    try {
      const externalResponse = await requestCarrierText({
        fetchImpl: this.config.fetchImpl,
        url: this.config.endpoint,
        method: "POST",
        headers: {
          accept: "application/xml, text/xml",
          "content-type": "application/xml; charset=utf-8",
        },
        body: buildTrackingXml({
          method: "packetCourierTracking",
          apiPassword: this.config.apiPassword,
          packetId: carrierShipmentId,
        }),
        timeoutMs: this.config.timeoutMs,
        maxAttempts: 3,
      })
      snapshot.externalObservation = parseExternalObservation(
        externalResponse,
        (this.config.now?.() ?? new Date()).toISOString(),
      )
    } catch (error) {
      snapshot.externalObservationErrorCode =
        asCarrierIntegrationError(error).code
    }

    return snapshot
  }
}
