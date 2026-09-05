import {
  isTerminalPacketaStatus,
  mapPacketaStatusCode,
  nextPacketaFailurePollAt,
  nextPacketaPollAt,
  packetaStatusNeedsAlert,
  packetaStatusProvesPhysicalHandoff,
} from "../src/client/packeta-status"

describe("Packeta authoritative status policy", () => {
  const referenceAt = new Date("2026-08-31T10:00:00.000Z")

  it("maps documented PUDO delivery and does not invent unknown mappings", () => {
    expect(mapPacketaStatusCode("7")).toBe("DELIVERED")
    expect(mapPacketaStatusCode("6")).toBe("IN_TRANSIT")
    expect(mapPacketaStatusCode("31")).toBe("UNKNOWN")
    expect(packetaStatusNeedsAlert("31")).toBe(true)
    expect(packetaStatusNeedsAlert("32")).toBe(true)
    expect(packetaStatusProvesPhysicalHandoff("31")).toBe(false)
  })

  it("emits physical handoff only after Packeta has received the parcel", () => {
    expect(packetaStatusProvesPhysicalHandoff("1")).toBe(false)
    expect(packetaStatusProvesPhysicalHandoff("2")).toBe(true)
    expect(packetaStatusProvesPhysicalHandoff("7")).toBe(true)
  })

  it("uses an eight-hour cadence after external carrier handoff", () => {
    expect(
      nextPacketaPollAt({ statusCode: "6", referenceAt })?.toISOString(),
    ).toBe("2026-08-31T18:00:00.000Z")
    expect(isTerminalPacketaStatus("6")).toBe(false)
    expect(isTerminalPacketaStatus("7")).toBe(true)
    expect(nextPacketaPollAt({ statusCode: "7", referenceAt })).toBeNull()
  })

  it("selects polling cadence for created, exception and normal states", () => {
    expect(
      nextPacketaPollAt({ statusCode: "1", referenceAt })?.toISOString(),
    ).toBe("2026-08-31T10:30:00.000Z")
    expect(
      nextPacketaPollAt({ statusCode: "999", referenceAt })?.toISOString(),
    ).toBe("2026-08-31T10:30:00.000Z")
    expect(
      nextPacketaPollAt({ statusCode: "9", referenceAt })?.toISOString(),
    ).toBe("2026-08-31T11:00:00.000Z")
    expect(
      nextPacketaPollAt({ statusCode: "2", referenceAt })?.toISOString(),
    ).toBe("2026-08-31T10:15:00.000Z")
  })

  it("backs failed reads off from 15 minutes up to six hours", () => {
    expect(
      nextPacketaFailurePollAt({ failureCount: 1, referenceAt }).toISOString(),
    ).toBe("2026-08-31T10:15:00.000Z")
    expect(
      nextPacketaFailurePollAt({ failureCount: 99, referenceAt }).toISOString(),
    ).toBe("2026-08-31T16:00:00.000Z")
  })
})
