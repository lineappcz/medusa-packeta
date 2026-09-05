import { createHash } from "node:crypto"
import { MedusaError } from "@medusajs/framework/utils"
import type {
  IFulfillmentProvider,
  CreateFulfillmentResult,
  FulfillmentOption,
} from "@medusajs/framework/types"
import {
  PacketaHttpAdapter,
  PacketaPickupPointValidator,
  type CreateCarrierShipmentCommand,
} from "../client"
import { RedisOperationStore, type OperationStore } from "./operation-store"

type CreateArgs = Parameters<IFulfillmentProvider["createFulfillment"]>
export type PacketaProviderOptions = {
  apiPassword: string
  senderIndication: string
  widgetApiKey: string
  redisUrl?: string
  operationStore?: OperationStore
  namespace: string
  buildShipment: (...args: CreateArgs) => Promise<CreateCarrierShipmentCommand>
  storeLabel: (input: {
    shipmentId: string
    content: Buffer
    format: string
  }) => Promise<string>
  fetchImpl?: typeof fetch
}

export default class PacketaProvider implements IFulfillmentProvider {
  static identifier = "packeta"
  private readonly client: PacketaHttpAdapter
  private readonly validator: PacketaPickupPointValidator
  private readonly store: OperationStore
  static validateOptions(options: Record<string, unknown>) {
    if (
      !options.apiPassword ||
      !options.senderIndication ||
      !/^\S{16}$/.test(String(options.widgetApiKey ?? "")) ||
      !options.namespace ||
      (!options.redisUrl && !options.operationStore) ||
      typeof options.buildShipment !== "function" ||
      typeof options.storeLabel !== "function"
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Packeta requires API credentials, widget key, namespace, durable storage, buildShipment and storeLabel",
      )
    }
  }
  constructor(
    _container: Record<string, unknown>,
    private readonly options: PacketaProviderOptions,
  ) {
    PacketaProvider.validateOptions(
      options as unknown as Record<string, unknown>,
    )
    this.client = new PacketaHttpAdapter({
      ...options,
      endpoint: "https://www.zasilkovna.cz/api/rest",
    })
    this.validator = new PacketaPickupPointValidator({
      apiKey: options.widgetApiKey,
      fetchImpl: options.fetchImpl,
    })
    this.store =
      options.operationStore ??
      new RedisOperationStore(options.redisUrl!, `${options.namespace}:packeta`)
  }
  getIdentifier() {
    return PacketaProvider.identifier
  }
  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [{ id: "packeta-pickup", name: "Packeta pickup point" }]
  }
  async validateOption(data: Record<string, unknown>) {
    return data.id === "packeta-pickup"
  }
  async canCalculate() {
    return false
  }
  async calculatePrice(): Promise<never> {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Configure a flat Medusa shipping price from your Packeta contract",
    )
  }
  async validateFulfillmentData(
    option: Record<string, unknown>,
    data: Record<string, unknown>,
    context: Parameters<IFulfillmentProvider["validateFulfillmentData"]>[2],
  ) {
    if (!(await this.validateOption(option)))
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Unknown Packeta shipping option",
      )
    const point = await this.validator.validate({
      pointId: String(data.pickup_point_id ?? ""),
      countryCode: String(context.shipping_address?.country_code ?? ""),
    })
    return { pickup_point_id: point.id }
  }
  async createFulfillment(
    ...args: CreateArgs
  ): Promise<CreateFulfillmentResult> {
    const command = await this.options.buildShipment(...args)
    // Medusa deletes a failed fulfillment and creates a new ID on retry. Use a
    // durable packing-operation ID and serialize uncertain writes per order.
    const orderId = args[2]?.id
    const operationId = args[4]?.shipping_operation_id
    if (
      typeof orderId !== "string" ||
      !orderId ||
      typeof operationId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(operationId)
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Order ID and stable additional_data.shipping_operation_id are required",
      )
    }
    const resource = `order:${orderId}`
    command.idempotencyKey = `${resource}:shipment:${operationId}`
    command.externalReference = createHash("sha256")
      .update(command.idempotencyKey)
      .digest("hex")
      .slice(0, 32)
    command.labelFormat = "PDF_A6"
    await this.validator.validate({
      pointId: command.pickupPointCode ?? "",
      countryCode: command.recipient.countryCode,
    })
    const shipment = await this.store.run(
      resource,
      `create:${operationId}`,
      command,
      async () => {
        const result = await this.client.createShipment(command)
        return { result, state: { shipment: result } }
      },
    )
    // Read-only label recovery is separate from creation. A storage failure must
    // never cause the already-created packet to be submitted again.
    const content = await this.client.getLabel(shipment.carrierShipmentId)
    const labelUrl = await this.options.storeLabel({
      shipmentId: shipment.carrierShipmentId,
      content,
      format: "PDF_A6",
    })
    if (!labelUrl || !labelUrl.startsWith("https://"))
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "storeLabel must return an authenticated HTTPS label endpoint",
      )
    return {
      data: {
        carrier_shipment_id: shipment.carrierShipmentId,
        label_url: labelUrl,
      },
      labels: [
        {
          tracking_number: shipment.trackingNumber,
          tracking_url: shipment.trackingUrl ?? "",
          label_url: labelUrl,
        },
      ],
    }
  }
  async cancelFulfillment(): Promise<never> {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Cancel the packet in Packeta and reconcile it before changing Medusa fulfillment state",
    )
  }
  async createReturnFulfillment(): Promise<never> {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Packeta returns are not supported in this release",
    )
  }
  async getFulfillmentDocuments(data: Record<string, unknown>) {
    return this.documents(data)
  }
  async getShipmentDocuments(data: Record<string, unknown>) {
    return this.documents(data)
  }
  async retrieveDocuments(data: Record<string, unknown>, type: string) {
    if (type !== "label")
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Only labels are supported",
      )
    return this.documents(data)
  }
  async getReturnDocuments(): Promise<never> {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Return documents are not supported",
    )
  }
  private documents(data: Record<string, unknown>) {
    return [{ label_url: data.label_url }]
  }
  async __shutdown() {
    await this.store.close?.()
  }
}
