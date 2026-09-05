import { mkdir, writeFile, readFile } from "node:fs/promises"
import { join, isAbsolute } from "node:path"

// A persistent, private volume. For multiple replicas use shared private object
// storage instead; keep the same callback signature and authenticated URL.
export async function storeLabel({
  shipmentId,
  content,
  format,
}: {
  shipmentId: string
  content: Buffer
  format: string
}): Promise<string> {
  const directory = process.env.CARRIER_LABEL_DIRECTORY
  const origin = process.env.MEDUSA_PUBLIC_URL
  if (
    !directory ||
    !isAbsolute(directory) ||
    !origin?.startsWith("https://") ||
    !/^\d{1,20}$/.test(shipmentId) ||
    !format.startsWith("PDF")
  ) {
    throw new Error(
      "Configure private label storage, public backend URL and PDF labels",
    )
  }
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const path = join(directory, shipmentId + ".pdf")
  try {
    await writeFile(path, content, { flag: "wx", mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    if (!(await readFile(path)).equals(content))
      throw new Error("Label content changed for an existing shipment")
  }
  return `${new URL(origin).origin}/admin/shipping-labels/${shipmentId}`
}
