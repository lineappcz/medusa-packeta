import { MedusaError } from "@medusajs/framework/utils"
import { createHash, randomUUID } from "node:crypto"
import Redis from "ioredis"

export type OperationState = Record<string, unknown>
export interface OperationStore {
  read(resource: string): Promise<OperationState>
  run<T>(
    resource: string,
    operation: string,
    payload: unknown,
    action: (
      state: OperationState,
    ) => Promise<{ result: T; state: OperationState }>,
  ): Promise<T>
  close?(): void | Promise<void>
}

// Reservations never expire automatically: an interrupted external write may
// have succeeded. Releasing it on a timer could issue a second charge/shipment.
const RESERVE = `
local previous = redis.call('GET', KEYS[1])
if previous then return previous end
if redis.call('EXISTS', KEYS[2]) == 1 then return 'BUSY' end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], ARGV[2])
return 'RESERVED'
`
const COMPLETE = `
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[3], ARGV[3])
redis.call('DEL', KEYS[2])
return 1
`

export class OperationPendingError extends Error {
  readonly code = "OPERATION_RECONCILIATION_REQUIRED"
  constructor() {
    super("An operation is pending or uncertain. Reconcile it before retrying.")
  }
}

export class RedisOperationStore implements OperationStore {
  private readonly redis: Redis
  constructor(
    url: string,
    private readonly namespace: string,
  ) {
    if (!/^rediss?:\/\//.test(url) || !/^[a-zA-Z0-9:_-]+$/.test(namespace)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A Redis URL and isolated operation namespace are required",
      )
    }
    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    })
    // Connection errors are returned to the operation caller without logging URLs.
    this.redis.on("error", () => {})
  }
  private async ready() {
    if (this.redis.status === "wait") await this.redis.connect()
    if (this.redis.status !== "ready")
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Operation storage unavailable",
      )
  }
  private keys(resource: string, operation = "") {
    const digest = createHash("sha256").update(resource).digest("hex")
    const root = `${this.namespace}:{${digest}}`
    return [
      `${root}:op:${createHash("sha256").update(operation).digest("hex")}`,
      `${root}:lock`,
      `${root}:state`,
    ]
  }
  async read(resource: string): Promise<OperationState> {
    await this.ready()
    const value = await this.redis.get(this.keys(resource)[2])
    return value ? JSON.parse(value) : {}
  }
  async run<T>(
    resource: string,
    operation: string,
    payload: unknown,
    action: (
      state: OperationState,
    ) => Promise<{ result: T; state: OperationState }>,
  ): Promise<T> {
    if (!resource || !operation)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Stable operation identity is required",
      )
    await this.ready()
    const keys = this.keys(resource, operation)
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex")
    const owner = randomUUID()
    const reserved = await this.redis.eval(
      RESERVE,
      2,
      keys[0],
      keys[1],
      JSON.stringify({ status: "pending", fingerprint }),
      owner,
    )
    if (reserved === "BUSY") throw new OperationPendingError()
    if (reserved !== "RESERVED") {
      const previous = JSON.parse(String(reserved))
      if (previous.fingerprint !== fingerprint)
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Idempotency key reused with different input",
        )
      if (previous.status !== "done") throw new OperationPendingError()
      return previous.result as T
    }
    // Keep the reservation on any error, including storage failure after the
    // bank accepted the request. No generic retry can resolve that ambiguity.
    const completed = await action(await this.read(resource))
    const saved = await this.redis.eval(
      COMPLETE,
      3,
      ...keys,
      owner,
      JSON.stringify({ status: "done", fingerprint, result: completed.result }),
      JSON.stringify(completed.state),
    )
    if (saved !== 1) throw new OperationPendingError()
    return completed.result
  }
  async close() {
    if (this.redis.status === "ready") await this.redis.quit()
    else if (!["end", "wait"].includes(this.redis.status))
      this.redis.disconnect()
  }
}
