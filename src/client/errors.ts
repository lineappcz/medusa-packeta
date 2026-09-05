export type CarrierErrorOutcome = "CONFIGURATION" | "DEFINITIVE" | "UNKNOWN"

const CARRIER_ERROR_BRAND = Symbol.for("lineapp.carrier.error")

export class CarrierIntegrationError extends Error {
  static [Symbol.hasInstance](value: unknown) {
    return Boolean(
      value &&
      typeof value === "object" &&
      (value as Record<symbol, unknown>)[
        Symbol.for("lineapp.carrier.error")
      ] === true,
    )
  }
  readonly [CARRIER_ERROR_BRAND] = true
  readonly code: string
  readonly outcome: CarrierErrorOutcome
  readonly retryable: boolean
  readonly httpStatus?: number
  readonly retryAfterMs?: number
  readonly retryAt?: string

  constructor({
    code,
    message,
    outcome = "DEFINITIVE",
    retryable = false,
    httpStatus,
    retryAfterMs,
    retryAt,
  }: {
    code: string
    message: string
    outcome?: CarrierErrorOutcome
    retryable?: boolean
    httpStatus?: number
    retryAfterMs?: number
    retryAt?: string
  }) {
    super(message)
    this.name = "CarrierIntegrationError"
    this.code = code
    this.outcome = outcome
    this.retryable = retryable
    this.httpStatus = httpStatus
    this.retryAfterMs = retryAfterMs
    this.retryAt = retryAt
  }
}

type CarrierInvariant = (
  condition: unknown,
  code: string,
  message: string,
  outcome?: CarrierErrorOutcome,
) => asserts condition

export const carrierInvariant: CarrierInvariant = (
  condition,
  code,
  message,
  outcome = "DEFINITIVE",
): asserts condition => {
  if (!condition) {
    throw new CarrierIntegrationError({ code, message, outcome })
  }
}

export const asCarrierIntegrationError = (
  error: unknown,
): CarrierIntegrationError => {
  if (error instanceof CarrierIntegrationError) {
    return error
  }

  return new CarrierIntegrationError({
    code: "CARRIER_OUTCOME_UNKNOWN",
    message: "Carrier request outcome could not be confirmed.",
    outcome: "UNKNOWN",
    retryable: true,
  })
}
