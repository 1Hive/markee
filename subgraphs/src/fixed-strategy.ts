import { BigInt, log } from "@graphprotocol/graph-ts"
import { MessageChanged } from "../generated/FixedStrategy1/FixedStrategy"
import { Markee, GlobalStats } from "../generated/schema"

// Helper function to load or create GlobalStats
function loadOrCreateGlobalStats(): GlobalStats {
  let stats = GlobalStats.load("1")
  if (stats == null) {
    stats = new GlobalStats("1")
    stats.totalMarkees = BigInt.fromI32(0)
    stats.totalFundsRaised = BigInt.fromI32(0)
    stats.totalTransactions = BigInt.fromI32(0)
    stats.save()
  }
  return stats
}

export function handleFixedMessageChanged(event: MessageChanged): void {
  log.info("Fixed MessageChanged: changedBy={}, message={}", [
    event.params.changedBy.toHexString(),
    event.params.newMessage
  ])

  // The Markee address is the contract that emitted this event
  // For FixedStrategy, the strategy contract itself is at event.address
  // We need to get the markeeAddress from the contract
  // For now, we'll use the strategy address as the ID
  
  let markeeId = event.address.toHexString()
  let markee = Markee.load(markeeId)
  
  if (markee == null) {
    // First time seeing this Fixed Markee
    markee = new Markee(markeeId)
    markee.address = event.address
    markee.owner = event.params.changedBy
    markee.message = event.params.newMessage
    markee.name = event.params.name
    markee.totalFundsAdded = event.params.pricePaid
    markee.pricingStrategy = event.address
    markee.chainId = BigInt.fromI32(10) // Optimism
    markee.createdAt = event.block.timestamp
    markee.createdAtBlock = event.block.number
    markee.updatedAt = event.block.timestamp
    markee.fundsAddedCount = BigInt.fromI32(1)
    markee.messageUpdateCount = BigInt.fromI32(0)
    
    // Update global stats
    let stats = loadOrCreateGlobalStats()
    stats.totalMarkees = stats.totalMarkees.plus(BigInt.fromI32(1))
    stats.totalFundsRaised = stats.totalFundsRaised.plus(event.params.pricePaid)
    stats.totalTransactions = stats.totalTransactions.plus(BigInt.fromI32(1))
    stats.save()
  } else {
    // Update existing Fixed Markee
    markee.message = event.params.newMessage
    markee.name = event.params.name
    markee.totalFundsAdded = markee.totalFundsAdded.plus(event.params.pricePaid)
    markee.updatedAt = event.block.timestamp
    markee.messageUpdateCount = markee.messageUpdateCount.plus(BigInt.fromI32(1))
    
    // Update global stats
    let stats = loadOrCreateGlobalStats()
    stats.totalFundsRaised = stats.totalFundsRaised.plus(event.params.pricePaid)
    stats.totalTransactions = stats.totalTransactions.plus(BigInt.fromI32(1))
    stats.save()
  }
  
  markee.save()
}
