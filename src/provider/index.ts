import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import PacketaProvider from "./service"
export { default as PacketaProvider } from "./service"
export type { PacketaProviderOptions } from "./service"
export * from "./operation-store"
export default ModuleProvider(Modules.FULFILLMENT, {
  services: [PacketaProvider],
})
