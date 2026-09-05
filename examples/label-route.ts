import { readFile } from "node:fs/promises"
import { join, isAbsolute } from "node:path"
import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

// Copy to src/api/admin/shipping-labels/[id]/route.ts. Medusa authenticates /admin.
// Keep authentication enabled; do not mount this as a public store route.
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  if (!req.auth_context?.actor_id)
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Authentication required",
    )
  const directory = process.env.CARRIER_LABEL_DIRECTORY
  if (!directory || !isAbsolute(directory) || !/^\d{1,20}$/.test(req.params.id))
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid label")
  let content: Buffer
  try {
    content = await readFile(join(directory, req.params.id + ".pdf"))
  } catch {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Label not found")
  }
  res.setHeader("Cache-Control", "private, no-store")
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("Content-Type", "application/pdf")
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="shipping-label.pdf"',
  )
  res.send(content)
}
