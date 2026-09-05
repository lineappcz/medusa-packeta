import { randomUUID } from "node:crypto"
import Redis from "ioredis"
import {
  RedisOperationStore,
  OperationPendingError,
} from "../src/provider/operation-store"

const url = process.env.REDIS_TEST_URL
if (!url) throw new Error("REDIS_TEST_URL must point to an isolated test Redis")

describe("durable external operations with real Redis", () => {
  const stores: RedisOperationStore[] = []
  const namespaces: string[] = []
  const create = (namespace = `test:${randomUUID()}`) => {
    namespaces.push(namespace)
    const store = new RedisOperationStore(url!, namespace)
    stores.push(store)
    return store
  }
  afterAll(async () => {
    await Promise.all(stores.map((store) => store.close()))
    const redis = new Redis(url!)
    for (const namespace of namespaces) {
      const keys = await redis.keys(`${namespace}:*`)
      if (keys.length) await redis.del(...keys)
    }
    await redis.quit()
  })
  it("replays a completed operation across process restarts", async () => {
    const namespace = `test:${randomUUID()}`
    const first = create(namespace)
    const action = jest
      .fn()
      .mockResolvedValue({ result: { id: "external-1" }, state: { count: 1 } })
    expect(
      await first.run("resource", "create", { amount: 5 }, action),
    ).toEqual({ id: "external-1" })
    await first.close()
    const second = create(namespace)
    expect(
      await second.run("resource", "create", { amount: 5 }, action),
    ).toEqual({ id: "external-1" })
    expect(action).toHaveBeenCalledTimes(1)
    expect(await second.read("resource")).toEqual({ count: 1 })
    await expect(
      second.run("resource", "create", { amount: 6 }, action),
    ).rejects.toThrow("different input")
  })
  it("reserves before I/O, serializes a resource and leaves uncertain writes blocked", async () => {
    const store = create()
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    let finish!: () => void
    const blocker = new Promise<void>((resolve) => {
      finish = resolve
    })
    const running = store.run("payment", "refund-1", {}, async () => {
      entered()
      await blocker
      throw new Error("network timeout after the bank accepted it")
    })
    await started
    const duplicate = jest.fn()
    await expect(
      store.run("payment", "refund-1", {}, duplicate),
    ).rejects.toBeInstanceOf(OperationPendingError)
    await expect(
      store.run("payment", "refund-2", {}, duplicate),
    ).rejects.toBeInstanceOf(OperationPendingError)
    finish()
    await expect(running).rejects.toThrow("network timeout")
    await expect(
      store.run("payment", "refund-1", {}, duplicate),
    ).rejects.toBeInstanceOf(OperationPendingError)
    expect(duplicate).not.toHaveBeenCalled()
  })
  it("passes the latest state between serialized operations", async () => {
    const store = create()
    await store.run("p", "one", {}, async () => ({
      result: 1,
      state: { refunded: 10 },
    }))
    const next = jest.fn(async (state) => ({
      result: 2,
      state: { refunded: state.refunded + 10 },
    }))
    await store.run("p", "two", {}, next)
    expect(next).toHaveBeenCalledWith({ refunded: 10 })
    expect(await store.read("p")).toEqual({ refunded: 20 })
  })
  it("rejects invalid configuration and identities before external I/O", async () => {
    expect(
      () => new RedisOperationStore("https://example.com", "test"),
    ).toThrow()
    expect(() => new RedisOperationStore(url!, "bad namespace")).toThrow()
    const store = create()
    await expect(store.run("", "", {}, jest.fn())).rejects.toThrow("identity")
  })
})
