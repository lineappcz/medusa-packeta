import {
  createPacketaPickupPointValidatorFromEnvironment,
  PACKETA_WIDGET_VALIDATION_ENDPOINT,
  PacketaPickupPointValidator,
} from "../src/client/packeta-pickup-point"

const validResponse = () => ({
  isValid: true,
  point: {
    name: "Praha 1, Jindřišská",
    address: {
      street: "Jindřišská 16",
      city: "Praha",
      zip: "11000",
      country: "cz",
    },
  },
})

const jsonResponse = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  })

describe("Packeta pickup-point validation", () => {
  it("stores only the authoritative point returned by Packeta", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(validResponse()))
    const validator = new PacketaPickupPointValidator({
      apiKey: "1234567890abcdef",
      fetchImpl,
    })

    await expect(
      validator.validate({ pointId: "79", countryCode: "CZ" }),
    ).resolves.toEqual({
      id: "79",
      name: "Praha 1, Jindřišská",
      address: "Jindřišská 16",
      city: "Praha",
      postal_code: "11000",
      country_code: "cz",
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(PACKETA_WIDGET_VALIDATION_ENDPOINT)
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-language": "cs",
      },
    })
    expect(JSON.parse(init.body)).toEqual({
      apiKey: "1234567890abcdef",
      point: { id: "79" },
      options: {
        country: "cz",
        vendors: [{ country: "cz" }],
      },
    })
  })

  it("fails closed when Packeta rejects or incompletely describes the point", async () => {
    const rejectedFetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({ isValid: false }))
    const incompleteFetch = jest.fn().mockResolvedValue(
      jsonResponse({
        isValid: true,
        point: { name: "Incomplete", address: { country: "cz" } },
      }),
    )

    await expect(
      new PacketaPickupPointValidator({
        apiKey: "1234567890abcdef",
        fetchImpl: rejectedFetch,
      }).validate({ pointId: "79", countryCode: "cz" }),
    ).rejects.toMatchObject({ code: "PACKETA_PICKUP_POINT_REJECTED" })

    await expect(
      new PacketaPickupPointValidator({
        apiKey: "1234567890abcdef",
        fetchImpl: incompleteFetch,
      }).validate({ pointId: "79", countryCode: "cz" }),
    ).rejects.toMatchObject({
      code: "PACKETA_PICKUP_POINT_RESPONSE_INCOMPLETE",
    })
  })

  it("rejects a point returned for another country", async () => {
    const payload = validResponse()
    payload.point.address.country = "sk"
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(payload))

    await expect(
      new PacketaPickupPointValidator({
        apiKey: "1234567890abcdef",
        fetchImpl,
      }).validate({ pointId: "79", countryCode: "cz" }),
    ).rejects.toMatchObject({ code: "PACKETA_PICKUP_POINT_COUNTRY_MISMATCH" })
  })

  it("requires explicit enablement and a valid account key", () => {
    expect(() =>
      createPacketaPickupPointValidatorFromEnvironment({
        PACKETA_CARRIER_ENABLED: "false",
      }),
    ).toThrow("not explicitly enabled")

    expect(() =>
      createPacketaPickupPointValidatorFromEnvironment({
        PACKETA_CARRIER_ENABLED: "true",
        PACKETA_WIDGET_API_KEY: "short",
      }),
    ).toThrow("missing or invalid")

    expect(() =>
      createPacketaPickupPointValidatorFromEnvironment({
        PACKETA_CARRIER_ENABLED: "true",
        PACKETA_WIDGET_API_KEY: "1234567890abcdef",
      }),
    ).not.toThrow()
  })
})
