import type { IFulfillmentProvider } from "@medusajs/framework/types"
import PacketaProvider from "../src/provider/service"
import { MemoryStore } from "./memory-store"
import { shipmentCommand } from "./fixtures"

const validPoint = {
  isValid: true,
  point: {
    name: "Test point",
    address: {
      city: "Praha",
      street: "Test",
      houseNumber: "1",
      zip: "11000",
      country: "cz",
    },
  },
}
const setup = () => {
  const fetchImpl = jest.fn(async (_url, request) => {
    const body = String(request.body)
    if (body.includes("<createPacket>"))
      return new Response(
        "<response><status>ok</status><result><id>1234567890</id><barcode>Z1234567890</barcode></result></response>",
      )
    if (body.includes("<packetLabelPdf>"))
      return new Response(
        "<response><status>ok</status><result>JVBERi0xLjQ=</result></response>",
      )
    return new Response(JSON.stringify(validPoint), {
      headers: { "content-type": "application/json" },
    })
  })
  const storeLabel = jest
    .fn()
    .mockResolvedValue("https://shop.example.com/admin/labels/1234567890")
  const options = {
    apiPassword: "test-password",
    senderIndication: "test-sender",
    widgetApiKey: "1234567890123456",
    namespace: "test",
    operationStore: new MemoryStore(),
    fetchImpl,
    storeLabel,
    buildShipment: async () => shipmentCommand(),
  }
  return {
    provider: new PacketaProvider({}, options),
    fetchImpl,
    storeLabel,
    options,
  }
}
describe("Medusa fulfillment provider", () => {
  it("blocks a replacement operation after an uncertain carrier write", async () => {
    const { provider, fetchImpl } = setup()
    fetchImpl.mockImplementation(async () => {
      throw new Error("connection lost")
    })
    const args: Parameters<IFulfillmentProvider["createFulfillment"]> = [
      {},
      [],
      { id: "order_uncertain" },
      { id: "ful_old" },
      { shipping_operation_id: "packing_original" },
    ]
    // PUDO validation is read-only and succeeds before the ambiguous write.
    fetchImpl.mockImplementation(async (_url, init) => {
      if (String(init.body).includes("<createPacket>"))
        throw new Error("connection lost")
      return new Response(JSON.stringify(validPoint), {
        headers: { "content-type": "application/json" },
      })
    })
    await expect(provider.createFulfillment(...args)).rejects.toThrow()
    const writesBefore = fetchImpl.mock.calls.filter(([, init]) =>
      String(init.body).includes("<createPacket>"),
    ).length
    args[3] = { id: "ful_replacement" }
    args[4] = { shipping_operation_id: "packing_bypass" }
    await expect(provider.createFulfillment(...args)).rejects.toThrow(
      "Reconcile",
    )
    expect(
      fetchImpl.mock.calls.filter(([, init]) =>
        String(init.body).includes("<createPacket>"),
      ),
    ).toHaveLength(writesBefore)
  })
  it("validates pickup points and creates a shipment only once across label retries", async () => {
    const { provider, fetchImpl, storeLabel } = setup()
    const context = { shipping_address: { country_code: "cz" } } as Parameters<
      IFulfillmentProvider["validateFulfillmentData"]
    >[2]
    expect(
      await provider.validateFulfillmentData(
        { id: "packeta-pickup" },
        { pickup_point_id: "52" },
        context,
      ),
    ).toEqual({ pickup_point_id: "52" })
    storeLabel.mockRejectedValueOnce(new Error("storage unavailable"))
    const args: Parameters<IFulfillmentProvider["createFulfillment"]> = [
      {},
      [],
      { id: "order_1" },
      { id: "ful_1" },
      { shipping_operation_id: "packing_1" },
    ]
    await expect(provider.createFulfillment(...args)).rejects.toThrow(
      "storage unavailable",
    )
    args[3] = { id: "ful_retry_new_id" }
    const fulfillment = await provider.createFulfillment(...args)
    expect(fulfillment.labels[0].tracking_number).toBe("Z1234567890")
    expect(
      fetchImpl.mock.calls.filter(([, init]) =>
        String(init.body).includes("<createPacket>"),
      ),
    ).toHaveLength(1)
    expect(storeLabel.mock.calls[0][0].content.toString()).toBe("%PDF-1.4")
    expect(await provider.getFulfillmentDocuments(fulfillment.data)).toEqual([
      { label_url: fulfillment.labels[0].label_url },
    ])
    expect(await provider.getShipmentDocuments(fulfillment.data)).toEqual(
      await provider.retrieveDocuments(fulfillment.data, "label"),
    )
    await provider.__shutdown()
  })
  it("advertises only supported flat-price delivery and refuses unsupported actions", async () => {
    const { provider } = setup()
    expect(provider.getIdentifier()).toBe("packeta")
    expect(await provider.getFulfillmentOptions()).toHaveLength(1)
    expect(await provider.validateOption({ id: "wrong" })).toBe(false)
    expect(await provider.canCalculate()).toBe(false)
    await expect(provider.calculatePrice()).rejects.toThrow("flat")
    await expect(provider.cancelFulfillment()).rejects.toThrow()
    await expect(provider.createReturnFulfillment()).rejects.toThrow()
    await expect(provider.getReturnDocuments()).rejects.toThrow()
    await expect(provider.retrieveDocuments({}, "invoice")).rejects.toThrow()
    await expect(provider.createFulfillment({}, [], {}, {})).rejects.toThrow(
      "ID",
    )
    expect(() => PacketaProvider.validateOptions({})).toThrow()
  })
})
