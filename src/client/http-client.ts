import { CarrierIntegrationError } from "./errors"
import type { CarrierFetch } from "./types"

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

export type CarrierHttpRequest = {
  fetchImpl?: CarrierFetch
  url: string
  method: "GET" | "POST"
  headers: Record<string, string>
  body?: string
  timeoutMs?: number
  maxAttempts?: number
  delay?: (milliseconds: number) => Promise<void>
  random?: () => number
  now?: () => number
  maxRetryDelayMs?: number
}

type CarrierHttpParser<T> = (response: Response) => Promise<T>

const defaultDelay = async (milliseconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

const retryAfterMilliseconds = (
  response: Response,
  now: () => number,
): number | null => {
  const value = response.headers.get("retry-after")?.trim()
  if (!value) return null
  if (/^\d+(\.\d+)?$/.test(value)) {
    return Math.max(0, Math.ceil(Number(value) * 1_000))
  }
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now()) : null
}

const retryDelay = ({
  attempt,
  response,
  random,
  now,
  maximum,
}: {
  attempt: number
  response?: Response
  random: () => number
  now: () => number
  maximum: number
}): number => {
  const exponential = 250 * 2 ** Math.max(0, attempt - 1)
  const requested = response ? (retryAfterMilliseconds(response, now) ?? 0) : 0
  const jitter = 0.9 + Math.min(Math.max(random(), 0), 1) * 0.2
  const jitteredExponential = Math.ceil(exponential * jitter)

  return Math.min(Math.max(jitteredExponential, requested), maximum)
}

const safeJson = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().includes("application/json")) {
    return null
  }

  try {
    return await response.json()
  } catch {
    return null
  }
}

const requestCarrier = async <T>(
  {
    fetchImpl = fetch,
    url,
    method,
    headers,
    body,
    timeoutMs = 10_000,
    maxAttempts = 3,
    delay = defaultDelay,
    random = Math.random,
    now = Date.now,
    maxRetryDelayMs = 30_000,
  }: CarrierHttpRequest,
  parse: CarrierHttpParser<T>,
): Promise<T> => {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
    throw new CarrierIntegrationError({
      code: "CARRIER_INVALID_RETRY_POLICY",
      message: "Carrier retry policy is invalid.",
      outcome: "CONFIGURATION",
    })
  }
  if (
    !Number.isFinite(maxRetryDelayMs) ||
    maxRetryDelayMs < 250 ||
    maxRetryDelayMs > 120_000
  ) {
    throw new CarrierIntegrationError({
      code: "CARRIER_INVALID_RETRY_POLICY",
      message: "Carrier maximum retry delay is invalid.",
      outcome: "CONFIGURATION",
    })
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        redirect: "error",
      })

      if (response.ok) {
        return await parse(response)
      }

      const retryable = RETRYABLE_HTTP_STATUSES.has(response.status)
      if (retryable && attempt < maxAttempts) {
        const retryAfterMs = retryAfterMilliseconds(response, now)

        if (retryAfterMs !== null && retryAfterMs > maxRetryDelayMs) {
          const retryAt = new Date(now() + retryAfterMs).toISOString()

          throw new CarrierIntegrationError({
            code: "CARRIER_RETRY_DEFERRED",
            message:
              "Carrier requested a retry outside the in-process retry window.",
            outcome: "UNKNOWN",
            retryable: true,
            httpStatus: response.status,
            retryAfterMs,
            retryAt,
          })
        }

        await delay(
          retryDelay({
            attempt,
            response,
            random,
            now,
            maximum: maxRetryDelayMs,
          }),
        )
        continue
      }

      throw new CarrierIntegrationError({
        code: retryable
          ? "CARRIER_TEMPORARILY_UNAVAILABLE"
          : "CARRIER_REQUEST_REJECTED",
        message: retryable
          ? "Carrier API is temporarily unavailable."
          : "Carrier rejected the request.",
        outcome: retryable ? "UNKNOWN" : "DEFINITIVE",
        retryable,
        httpStatus: response.status,
      })
    } catch (error) {
      if (error instanceof CarrierIntegrationError) {
        throw error
      }

      const timedOut =
        controller.signal.aborted ||
        (error instanceof Error && error.name === "AbortError")

      if (attempt < maxAttempts) {
        await delay(
          retryDelay({
            attempt,
            random,
            now,
            maximum: maxRetryDelayMs,
          }),
        )
        continue
      }

      throw new CarrierIntegrationError({
        code: timedOut ? "CARRIER_REQUEST_TIMEOUT" : "CARRIER_NETWORK_ERROR",
        message: timedOut
          ? "Carrier request timed out with an unknown outcome."
          : "Carrier request failed with an unknown outcome.",
        outcome: "UNKNOWN",
        retryable: true,
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new CarrierIntegrationError({
    code: "CARRIER_RETRY_EXHAUSTED",
    message: "Carrier request exhausted its retry policy.",
    outcome: "UNKNOWN",
    retryable: true,
  })
}

export const requestCarrierJson = async <T>(
  request: CarrierHttpRequest,
): Promise<T> =>
  requestCarrier(request, async (response) => (await safeJson(response)) as T)

export const requestCarrierText = async (
  request: CarrierHttpRequest,
): Promise<string> => requestCarrier(request, (response) => response.text())
