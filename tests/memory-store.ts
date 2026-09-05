import {
  OperationPendingError,
  type OperationStore,
  type OperationState,
} from "../src/provider/operation-store"
export class MemoryStore implements OperationStore {
  private readonly states = new Map<string, OperationState>()
  private readonly results = new Map<
    string,
    { fingerprint: string; value: unknown }
  >()
  private readonly pending = new Set<string>()
  async read(resource: string) {
    return this.states.get(resource) ?? {}
  }
  async run<T>(
    resource: string,
    operation: string,
    payload: unknown,
    action: (
      state: OperationState,
    ) => Promise<{ result: T; state: OperationState }>,
  ): Promise<T> {
    const key = resource + ":" + operation
    const fingerprint = JSON.stringify(payload)
    const previous = this.results.get(key)
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error("input changed")
      return previous.value as T
    }
    if (this.pending.has(resource)) throw new OperationPendingError()
    this.pending.add(resource)
    const value = await action(await this.read(resource))
    this.states.set(resource, value.state)
    this.results.set(key, { fingerprint, value: value.result })
    this.pending.delete(resource)
    return value.result
  }
}
