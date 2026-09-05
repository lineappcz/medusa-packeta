import { CarrierIntegrationError, carrierInvariant } from "./errors"
import { requestCarrierJson } from "./http-client"
import type { CarrierFetch } from "./types"

export const PACKETA_WIDGET_VALIDATION_ENDPOINT =
  "https://widget.packeta.com/v6/pps/api/widget/v1/validate"

export type ValidatedPacketaPickupPoint = {
  id: string
  name: string
  address: string
  city: string
  postal_code: string
  country_code: string
}

type RuntimeRecord = Record<string, unknown>

const asRecord = (value: unknown): RuntimeRecord | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as RuntimeRecord)
    : null

const requiredString = (
  record: RuntimeRecord,
  key: string,
  code: string,
): string => {
  const value = record[key]
  carrierInvariant(
    typeof value === "string" && Boolean(value.trim()),
    code,
    "Packeta pickup-point response is incomplete.",
    "UNKNOWN",
  )

  return value.trim()
}

const normalizeResponse = ({
  payload,
  pointId,
  countryCode,
}: {
  payload: unknown
  pointId: string
  countryCode: string
}): ValidatedPacketaPickupPoint => {
  const response = asRecord(payload)
  carrierInvariant(
    response,
    "PACKETA_PICKUP_POINT_RESPONSE_INVALID",
    "Packeta pickup-point validation returned an invalid response.",
    "UNKNOWN",
  )

  if (response.isValid !== true) {
    throw new CarrierIntegrationError({
      code: "PACKETA_PICKUP_POINT_REJECTED",
      message: "Packeta rejected the selected pickup point.",
    })
  }

  const point = asRecord(response.point)
  const address = asRecord(point?.address)
  carrierInvariant(
    point && address,
    "PACKETA_PICKUP_POINT_RESPONSE_INCOMPLETE",
    "Packeta pickup-point validation response is incomplete.",
    "UNKNOWN",
  )

  const responseCountry = requiredString(
    address,
    "country",
    "PACKETA_PICKUP_POINT_RESPONSE_INCOMPLETE",
  ).toLowerCase()
  carrierInvariant(
    responseCountry === countryCode,
    "PACKETA_PICKUP_POINT_COUNTRY_MISMATCH",
    "Packeta returned a pickup point in a different country.",
  )

  return {
    id: pointId,
    name: requiredString(
      point,
      "name",
      "PACKETA_PICKUP_POINT_RESPONSE_INCOMPLETE",
    ),
    address: requiredString(
      address,
      "street",
      "PACKETA_PICKUP_POINT_RESPONSE_INCOMPLETE",
    ),
    city: requiredString(
      address,
      "city",
      "PACKETA_PICKUP_POINT_RESPONSE_INCOMPLETE",
    ),
    postal_code: requiredString(
      address,
      "zip",
      "PACKETA_PICKUP_POINT_RESPONSE_INCOMPLETE",
    ),
    country_code: responseCountry,
  }
}

export class PacketaPickupPointValidator {
  constructor(
    private readonly config: {
      apiKey: string
      fetchImpl?: CarrierFetch
      timeoutMs?: number
    },
  ) {}

  async validate({
    pointId,
    countryCode,
  }: {
    pointId: string
    countryCode: string
  }): Promise<ValidatedPacketaPickupPoint> {
    const normalizedPointId = pointId.trim()
    const normalizedCountryCode = countryCode.trim().toLowerCase()

    carrierInvariant(
      /^\d{1,20}$/.test(normalizedPointId),
      "PACKETA_PICKUP_POINT_ID_INVALID",
      "Packeta pickup-point ID is invalid.",
    )
    carrierInvariant(
      /^[a-z]{2}$/.test(normalizedCountryCode),
      "PACKETA_PICKUP_POINT_COUNTRY_INVALID",
      "Packeta pickup-point country is invalid.",
    )

    const payload = await requestCarrierJson<unknown>({
      fetchImpl: this.config.fetchImpl,
      url: PACKETA_WIDGET_VALIDATION_ENDPOINT,
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-language": "cs",
      },
      body: JSON.stringify({
        apiKey: this.config.apiKey,
        point: { id: normalizedPointId },
        options: {
          country: normalizedCountryCode,
          vendors: [{ country: normalizedCountryCode }],
        },
      }),
      timeoutMs: this.config.timeoutMs,
      maxAttempts: 3,
    })

    return normalizeResponse({
      payload,
      pointId: normalizedPointId,
      countryCode: normalizedCountryCode,
    })
  }
}

export const createPacketaPickupPointValidatorFromEnvironment = (
  environment: Record<string, string | undefined> = process.env,
  fetchImpl?: CarrierFetch,
): PacketaPickupPointValidator => {
  if (environment.PACKETA_CARRIER_ENABLED !== "true") {
    throw new CarrierIntegrationError({
      code: "CARRIER_INTEGRATION_DISABLED",
      message: "Packeta carrier integration is not explicitly enabled.",
      outcome: "CONFIGURATION",
    })
  }

  const apiKey = environment.PACKETA_WIDGET_API_KEY?.trim()
  carrierInvariant(
    apiKey && /^\S{16}$/.test(apiKey),
    "PACKETA_WIDGET_API_KEY_INVALID",
    "Packeta widget API key is missing or invalid.",
    "CONFIGURATION",
  )

  return new PacketaPickupPointValidator({ apiKey, fetchImpl })
}
