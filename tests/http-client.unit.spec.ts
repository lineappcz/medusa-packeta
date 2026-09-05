import { CarrierIntegrationError } from "../src/client/errors"
import { requestCarrierJson } from "../src/client/http-client"

describe("carrier HTTP client", () => {
  it("retries temporary responses and returns the first successful mapping", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ retry: true }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )

    await expect(
      requestCarrierJson<{ ok: boolean }>({
        fetchImpl,
        url: "https://carrier.example.test/shipments",
        method: "POST",
        headers: {},
        maxAttempts: 2,
        delay: async () => undefined,
      }),
    ).resolves.toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("does not retry definitive validation failures", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ invalid: true }), {
        status: 422,
        headers: { "content-type": "application/json" },
      }),
    )

    await expect(
      requestCarrierJson({
        fetchImpl,
        url: "https://carrier.example.test/shipments",
        method: "POST",
        headers: {},
        maxAttempts: 3,
        delay: async () => undefined,
      }),
    ).rejects.toMatchObject({
      code: "CARRIER_REQUEST_REJECTED",
      retryable: false,
      outcome: "DEFINITIVE",
      httpStatus: 422,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("never retries before a Retry-After value within the in-process window", async () => {
    const delays: number[] = []
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        new Response("busy", {
          status: 429,
          headers: { "retry-after": "20" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )

    await expect(
      requestCarrierJson<{ ok: boolean }>({
        fetchImpl,
        url: "https://carrier.example.test/shipments",
        method: "POST",
        headers: {},
        maxAttempts: 2,
        maxRetryDelayMs: 30_000,
        random: () => 0,
        delay: async (milliseconds) => {
          delays.push(milliseconds)
        },
      }),
    ).resolves.toEqual({ ok: true })
    expect(delays).toEqual([20_000])
  })

  it("defers without retrying when Retry-After exceeds the in-process window", async () => {
    const delays: number[] = []
    const now = Date.parse("2026-09-01T12:00:00.000Z")
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response("busy", {
        status: 429,
        headers: { "retry-after": "120" },
      }),
    )

    await expect(
      requestCarrierJson({
        fetchImpl,
        url: "https://carrier.example.test/shipments",
        method: "POST",
        headers: {},
        maxAttempts: 2,
        maxRetryDelayMs: 30_000,
        now: () => now,
        delay: async (milliseconds) => {
          delays.push(milliseconds)
        },
      }),
    ).rejects.toMatchObject({
      code: "CARRIER_RETRY_DEFERRED",
      retryable: true,
      retryAfterMs: 120_000,
      retryAt: "2026-09-01T12:02:00.000Z",
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(delays).toEqual([])
  })

  it("classifies a timeout as retryable with an unknown outcome", async () => {
    const fetchImpl = jest.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted")
            error.name = "AbortError"
            reject(error)
          })
        }),
    ) as unknown as typeof fetch

    const promise = requestCarrierJson({
      fetchImpl,
      url: "https://carrier.example.test/shipments",
      method: "POST",
      headers: {},
      timeoutMs: 5,
      maxAttempts: 1,
    })

    await expect(promise).rejects.toEqual(
      expect.objectContaining<Partial<CarrierIntegrationError>>({
        code: "CARRIER_REQUEST_TIMEOUT",
        retryable: true,
        outcome: "UNKNOWN",
      }),
    )
  })
})
