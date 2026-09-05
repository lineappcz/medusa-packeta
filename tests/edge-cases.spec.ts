import {
  CarrierIntegrationError,
  asCarrierIntegrationError,
} from "../src/client/errors"
import { isCarrierTrackingAdapter } from "../src/client/types"
import { PacketaHttpAdapter } from "../src/client/packeta"
import { shipmentCommand } from "./fixtures"

describe("protocol rejection and recovery boundaries", () => {
  it("recognizes cross-package carrier errors and tracking capability", () => {
    const error = new CarrierIntegrationError({
      code: "TEST",
      message: "synthetic",
    })
    expect(asCarrierIntegrationError(error)).toBe(error)
    expect(
      asCarrierIntegrationError(new Error("private provider payload")),
    ).toMatchObject({ outcome: "UNKNOWN", code: "CARRIER_OUTCOME_UNKNOWN" })
    expect(
      isCarrierTrackingAdapter({
        provider: "packeta",
        isConfigured: true,
        createShipment: jest.fn(),
      }),
    ).toBe(false)
    expect(
      isCarrierTrackingAdapter(
        new PacketaHttpAdapter({
          endpoint: "https://www.zasilkovna.cz/api/rest",
          apiPassword: "test",
          senderIndication: "test",
        }),
      ),
    ).toBe(true)
  })
  it("rejects missing credentials, unsafe endpoints and invalid parcel weights before sending", async () => {
    expect(
      () =>
        new PacketaHttpAdapter({
          endpoint: "https://evil.example",
          apiPassword: "test",
          senderIndication: "test",
        }),
    ).toThrow("official")
    expect(
      () =>
        new PacketaHttpAdapter({
          endpoint: "https://www.zasilkovna.cz/api/rest",
          apiPassword: "",
          senderIndication: "test",
        }),
    ).toThrow("password")
    const fetchImpl = jest.fn()
    const client = new PacketaHttpAdapter({
      endpoint: "https://www.zasilkovna.cz/api/rest",
      apiPassword: "test",
      senderIndication: "test",
      fetchImpl,
    })
    const command = shipmentCommand()
    await expect(
      client.createShipment({
        ...command,
        packages: [{ ...command.packages[0], weightGrams: 0 }],
      }),
    ).rejects.toThrow("weight")
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it.each([
    "<response><status>fault</status></response>",
    "<response><status>ok</status><result><id>bad</id></result></response>",
    "<response><status>ok</status><result><id>123</id><barcode>bad</barcode></result></response>",
  ])(
    "does not repeat rejected or malformed creation responses",
    async (body) => {
      const fetchImpl = jest.fn().mockResolvedValue(new Response(body))
      const client = new PacketaHttpAdapter({
        endpoint: "https://www.zasilkovna.cz/api/rest",
        apiPassword: "test",
        senderIndication: "test",
        fetchImpl,
      })
      await expect(
        client.createShipment(shipmentCommand()),
      ).rejects.toBeInstanceOf(CarrierIntegrationError)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    },
  )
  it("escapes XML, supports single names and rejects invalid/missing contacts", async () => {
    const fetchImpl = jest
      .fn()
      .mockImplementation(
        async () =>
          new Response(
            "<response><status>ok</status><result><id>123</id><barcode>Z123</barcode></result></response>",
          ),
      )
    const client = new PacketaHttpAdapter({
      endpoint: "https://www.zasilkovna.cz/api/rest",
      apiPassword: "a&b",
      senderIndication: "test",
      fetchImpl,
    })
    const command = shipmentCommand()
    command.recipient.name = "Single"
    await client.createShipment(command)
    expect(fetchImpl.mock.calls[0][1].body).toContain("<surname>-</surname>")
    expect(fetchImpl.mock.calls[0][1].body).toContain("a&amp;b")
    await expect(
      client.createShipment({ ...command, packages: [] }),
    ).rejects.toThrow("one package")
    await expect(
      client.createShipment({ ...command, pickupPointCode: undefined }),
    ).rejects.toThrow("PUDO")
    await expect(
      client.createShipment({ ...command, currencyCode: "X" }),
    ).rejects.toThrow("currency")
    await expect(
      client.createShipment({
        ...command,
        recipient: { ...command.recipient, phone: undefined },
      }),
    ).rejects.toThrow("phone")
    await expect(client.getLabel("invalid")).rejects.toThrow("ID")
    await expect(client.getTrackingStatus("invalid")).rejects.toThrow("ID")
  })
})
