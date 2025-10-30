export interface Markee {
  address: string
  owner: string
  message: string
  totalFundsAdded: bigint
  chainId: number
  pricingStrategy: string
}

export interface MarkeeWithChain extends Markee {
  chainName: string
  chainColor: string
}
