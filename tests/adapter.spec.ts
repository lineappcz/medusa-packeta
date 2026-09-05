import { PacketaHttpAdapter } from "../src/client/packeta"
import { shipmentCommand } from "./fixtures"
const jsonResponse = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
describe("carrier protocol", () => {
  it("uses createPacket and maps Packeta packet ID plus barcode", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        new Response(
          '<?xml version="1.0"?><response><status>ok</status><result><id>1234567890</id><barcode>Z1234567890</barcode></result></response>',
          { status: 200, headers: { "content-type": "application/xml" } },
        ),
      )
    const adapter = new PacketaHttpAdapter({
      endpoint: "https://www.zasilkovna.test/api/rest",
      apiPassword: "secret-api-password",
      senderIndication: "Example Store",
      fetchImpl,
    })

    await expect(adapter.createShipment(shipmentCommand())).resolves.toEqual({
      provider: "packeta",
      carrierShipmentId: "1234567890",
      trackingNumber: "Z1234567890",
      trackingUrl: "https://tracking.packeta.com/cs/?id=Z1234567890",
    })

    const [, init] = fetchImpl.mock.calls[0]
    expect(init.headers).toMatchObject({
      "content-type": "application/xml; charset=utf-8",
    })
    expect(init.body).toContain("<createPacket>")
    expect(init.body).not.toContain("<createShipment>")
    expect(init.body).toContain("<number>EXAMPLE-ORDER-0001</number>")
    expect(init.body).toContain("<addressId>52</addressId>")
    expect(init.body).toContain("<cod>0.00</cod>")
    expect(init.body).toContain("<value>125.00</value>")
    expect(init.body).toContain("<currency>CZK</currency>")
    expect(init.body).toContain("<eshop>Example Store</eshop>")
  })
  it("treats packetStatus 7 as authoritative delivery", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        new Response(
          "<response><status>ok</status><result><dateTime>2026-01-10T15:34:06</dateTime><statusCode>7</statusCode><codeText>delivered</codeText></result></response>",
          { status: 200, headers: { "content-type": "application/xml" } },
        ),
      )
    const adapter = new PacketaHttpAdapter({
      endpoint: "https://www.zasilkovna.test/api/rest",
      apiPassword: "secret-api-password",
      senderIndication: "Example Store",
      fetchImpl,
    })

    await expect(adapter.getTrackingStatus("1234567890")).resolves.toEqual({
      provider: "packeta",
      carrierShipmentId: "1234567890",
      eventId: expect.stringMatching(/^packeta_[a-f0-9]{32}$/),
      status: "DELIVERED",
      rawStatus: "7",
      occurredAt: "2026-01-10T14:34:06.000Z",
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][1].body).toContain("<packetStatus>")
  })
  it("fetches opaque courier tracking after authoritative status 6", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          "<response><status>ok</status><result><dateTime>2026-06-10T15:34:06</dateTime><statusCode>6</statusCode><codeText>handed to carrier</codeText></result></response>",
          { status: 200, headers: { "content-type": "application/xml" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          "<response><status>ok</status><result><item><dateTime>2026-06-10T16:00:00</dateTime><carrierClass>external-test</carrierClass><statusCode>confirmed</statusCode></item></result></response>",
          { status: 200, headers: { "content-type": "application/xml" } },
        ),
      )
    const adapter = new PacketaHttpAdapter({
      endpoint: "https://www.zasilkovna.test/api/rest",
      apiPassword: "secret-api-password",
      senderIndication: "Example Store",
      fetchImpl,
      now: () => new Date("2026-06-10T14:05:00.000Z"),
    })
    const result = await adapter.getTrackingStatus("1234567890")

    expect(result).toMatchObject({
      status: "IN_TRANSIT",
      rawStatus: "6",
      externalObservation: {
        observedAt: "2026-06-10T14:05:00.000Z",
        statusCode: "confirmed",
        observationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls[1][1].body).toContain("<packetCourierTracking>")
  })
})
