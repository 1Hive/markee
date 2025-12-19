import { BigInt, log, Address } from "@graphprotocol/graph-ts"
import { MessageChanged } from "../generated/FixedPriceStrategy1/FixedPriceStrategy"
import { 
  FixedPriceStrategy, 
  FixedPriceMessageChange,
  GlobalStats 
} from "../generated/schema"

// Import the contract to read values
import { FixedPriceStrategy as FixedPriceStrategyContract } from "../generated/FixedPriceStrategy1/FixedPriceStrategy"

// Helper function to load or create GlobalStats
function loadOrCreateGlobalStats(): GlobalStats {
  let stats = GlobalStats.load("1")
  if (stats == null) {
    stats = new GlobalStats("1")
    stats.totalMarkees = BigInt.fromI32(0)
    stats.totalFundsRaised = BigInt.fromI32(0)
    stats.totalTransactions = BigInt.fromI32(0)
    stats.totalFixedPriceRevenue = BigInt.fromI32(0)
    stats.totalFixedPriceChanges = BigInt.fromI32(0)
    stats.save()
  }
  return stats
}

export function handleFixedPriceMessageChanged(event: MessageChanged): void {
  log.info("FixedPrice MessageChanged: changedBy={}, message={}, name={}, price={}", [
    event.params.changedBy.toHexString(),
    event.params.newMessage,
    event.params.name,
    event.params.pricePaid.toString()
  ])

  // Load or create the FixedPriceStrategy entity
  let strategyId = event.address.toHexString()
  let strategy = FixedPriceStrategy.load(strategyId)
  
  if (strategy == null) {
    // First time seeing this FixedPriceStrategy
    strategy = new FixedPriceStrategy(strategyId)
    strategy.address = event.address
    strategy.totalRevenue = BigInt.fromI32(0)
    strategy.messageChangeCount = BigInt.fromI32(0)
    strategy.currentMessage = ""
    strategy.currentName = ""
    strategy.createdAt = event.block.timestamp
    strategy.createdAtBlock = event.block.number
    
    // Read contract values
    let contract = FixedPriceStrategyContract.bind(event.address)
    
    let markeeAddressResult = contract.try_markeeAddress()
    if (!markeeAddressResult.reverted) {
      strategy.markeeAddress = markeeAddressResult.value
    } else {
      log.warning("Failed to read markeeAddress for strategy {}", [strategyId])
      strategy.markeeAddress = Address.zero()
    }
    
    let priceResult = contract.try_price()
    if (!priceResult.reverted) {
      strategy.price = priceResult.value
    } else {
      log.warning("Failed to read price for strategy {}", [strategyId])
      strategy.price = BigInt.fromI32(0)
    }
    
    let maxMessageLengthResult = contract.try_maxMessageLength()
    if (!maxMessageLengthResult.reverted) {
      strategy.maxMessageLength = maxMessageLengthResult.value
    } else {
      strategy.maxMessageLength = BigInt.fromI32(0)
    }
    
    let maxNameLengthResult = contract.try_maxNameLength()
    if (!maxNameLengthResult.reverted) {
      strategy.maxNameLength = maxNameLengthResult.value
    } else {
      strategy.maxNameLength = BigInt.fromI32(0)
    }
    
    let ownerResult = contract.try_owner()
    if (!ownerResult.reverted) {
      strategy.owner = ownerResult.value
    } else {
      strategy.owner = Address.zero()
    }
    
    let revNetTerminalResult = contract.try_revNetTerminal()
    if (!revNetTerminalResult.reverted) {
      strategy.revNetTerminal = revNetTerminalResult.value
    } else {
      strategy.revNetTerminal = Address.zero()
    }
    
    let revNetProjectIdResult = contract.try_revNetProjectId()
    if (!revNetProjectIdResult.reverted) {
      strategy.revNetProjectId = revNetProjectIdResult.value
    } else {
      strategy.revNetProjectId = BigInt.fromI32(0)
    }
  }

  // Store old values for the change event
  let oldMessage = strategy.currentMessage
  let oldName = strategy.currentName

  // Update strategy with new values
  strategy.currentMessage = event.params.newMessage
  strategy.currentName = event.params.name
  strategy.totalRevenue = strategy.totalRevenue.plus(event.params.pricePaid)
  strategy.messageChangeCount = strategy.messageChangeCount.plus(BigInt.fromI32(1))
  strategy.save()

  // Create FixedPriceMessageChange event
  let changeId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let messageChange = new FixedPriceMessageChange(changeId)
  messageChange.strategy = strategy.id
  messageChange.changedBy = event.params.changedBy
  messageChange.oldMessage = oldMessage
  messageChange.newMessage = event.params.newMessage
  messageChange.oldName = oldName
  messageChange.newName = event.params.name
  messageChange.pricePaid = event.params.pricePaid
  messageChange.timestamp = event.block.timestamp
  messageChange.blockNumber = event.block.number
  messageChange.transactionHash = event.transaction.hash
  messageChange.save()

  // Update global stats
  let stats = loadOrCreateGlobalStats()
  stats.totalFundsRaised = stats.totalFundsRaised.plus(event.params.pricePaid)
  stats.totalFixedPriceRevenue = stats.totalFixedPriceRevenue.plus(event.params.pricePaid)
  stats.totalFixedPriceChanges = stats.totalFixedPriceChanges.plus(BigInt.fromI32(1))
  stats.totalTransactions = stats.totalTransactions.plus(BigInt.fromI32(1))
  stats.save()

  log.info("FixedPrice strategy {} updated: totalRevenue={}, changeCount={}", [
    strategyId,
    strategy.totalRevenue.toString(),
    strategy.messageChangeCount.toString()
  ])
}
