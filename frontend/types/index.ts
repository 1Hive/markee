export interface FundsAdded {
  id: string
  markee: string
  addedBy: string
  amount: bigint
  newTotal: bigint
  timestamp: bigint
  blockNumber: bigint
  transactionHash: string
}

export interface EmojiReaction {
  id: string
  markeeAddress: string
  userAddress: string
  emoji: string
  timestamp: bigint
}

export interface MessageUpdate {
  id: string
  markee: string
  updatedBy: string
  oldMessage: string
  newMessage: string
  timestamp: bigint
  blockNumber: bigint
  transactionHash: string
}

export interface NameUpdate {
  id: string
  markee: string
  updatedBy: string
  oldName: string
  newName: string
  timestamp: bigint
  blockNumber: bigint
  transactionHash: string
}

export interface Markee {
  address: string
  owner: string
  name?: string
  reactions?: EmojiReaction[]
  message: string
  totalFundsAdded: bigint
  chainId: number
  pricingStrategy: string

  // Optional relations
  fundsAddedEvents?: FundsAdded[]
  messageUpdates?: MessageUpdate[]
  nameUpdates?: NameUpdate[]
}

export interface MarkeeWithChain extends Markee {
  chainName: string
  chainColor: string
}
