import { BigInt, Address, log } from "@graphprotocol/graph-ts"
import {
  MarkeeCreated,
  FundsAddedToMarkee,
  MessageUpdated,
  NameUpdated,
  InstanceNameUpdated
} from "../generated/TopDawgStrategy/TopDawgStrategy"
import { TopDawgStrategy as TopDawgStrategyContract } from "../generated/TopDawgStrategy/TopDawgStrategy"
import { Markee as MarkeeContract } from "../generated/TopDawgStrategy/Markee"
import { Markee as MarkeeTemplate } from "../generated/templates"
import {
  Markee,
  TopDawgStrategy,
  GlobalStats,
  FundsAdded,
  MessageUpdate,
  NameUpdate
} from "../generated/schema"

// Helper: load or create GlobalStats
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

// Helper: load or create TopDawgStrategy
function loadOrCreateTopDawgStrategy(address: Address): TopDawgStrategy {
  let strategy = TopDawgStrategy.load(address.toHexString())
  if (strategy == null) {
    strategy = new TopDawgStrategy(address.toHexString())
    strategy.address = address
    strategy.minimumPrice = BigInt.fromI32(0)
    strategy.maxMessageLength = BigInt.fromI32(0)
    strategy.maxNameLength = BigInt.fromI32(0)
    strategy.totalMarkeesCreated = BigInt.fromI32(0)
    strategy.totalFundsRaised = BigInt.fromI32(0)
    strategy.totalInstanceFunds = BigInt.fromI32(0)
    strategy.instanceName = ""
    strategy.createdAt = BigInt.fromI32(0)
    strategy.createdAtBlock = BigInt.fromI32(0)
    
    // Try to read instanceName from contract
    let contract = TopDawgStrategyContract.bind(address)
    let instanceNameResult = contract.try_instanceName()
    if (!instanceNameResult.reverted) {
      strategy.instanceName = instanceNameResult.value
    }
    
    // Try to read other contract values
    let minimumPriceResult = contract.try_minimumPrice()
    if (!minimumPriceResult.reverted) {
      strategy.minimumPrice = minimumPriceResult.value
    }
    
    let maxMessageLengthResult = contract.try_maxMessageLength()
    if (!maxMessageLengthResult.reverted) {
      strategy.maxMessageLength = maxMessageLengthResult.value
    }
    
    let maxNameLengthResult = contract.try_maxNameLength()
    if (!maxNameLengthResult.reverted) {
      strategy.maxNameLength = maxNameLengthResult.value
    }
    
    strategy.save()
  }
  return strategy
}

export function handleMarkeeCreated(event: MarkeeCreated): void {
  log.info("MarkeeCreated event: markeeAddress={}, owner={}, message={}, name={}, amount={}", [
    event.params.markeeAddress.toHexString(),
    event.params.owner.toHexString(),
    event.params.message,
    event.params.name,
    event.params.amount.toString()
  ])

  // Create the root Markee entity
  let markee = Markee.load(event.params.markeeAddress.toHexString())
  if (markee == null) {
    markee = new Markee(event.params.markeeAddress.toHexString())
    markee.address = event.params.markeeAddress
    markee.owner = event.params.owner
    markee.message = event.params.message
    markee.name = event.params.name
    markee.totalFundsAdded = event.params.amount
    markee.pricingStrategy = event.address
    markee.strategy = event.address.toHexString() // Link to TopDawgStrategy
    markee.createdAt = event.block.timestamp
    markee.createdAtBlock = event.block.number
    markee.updatedAt = event.block.timestamp
    markee.updatedAtBlock = event.block.number
    markee.fundsAddedCount = BigInt.fromI32(1)
    markee.messageUpdateCount = BigInt.fromI32(0)
    markee.nameUpdateCount = BigInt.fromI32(0)
    markee.save()
  }

  // Start indexing the Markee contract for future events
  MarkeeTemplate.create(event.params.markeeAddress)

  // Create initial FundsAdded event
  let fundsAdded = new FundsAdded(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  )
  fundsAdded.markee = markee.id
  fundsAdded.addedBy = event.params.owner
  fundsAdded.amount = event.params.amount
  fundsAdded.newMarkeeTotal = event.params.amount
  fundsAdded.timestamp = event.block.timestamp
  fundsAdded.blockNumber = event.block.number
  fundsAdded.transactionHash = event.transaction.hash
  fundsAdded.save()

  // Update TopDawgStrategy stats
  let strategy = loadOrCreateTopDawgStrategy(event.address)
  strategy.totalMarkeesCreated = strategy.totalMarkeesCreated.plus(BigInt.fromI32(1))
  strategy.totalFundsRaised = strategy.totalFundsRaised.plus(event.params.amount)
  strategy.totalInstanceFunds = strategy.totalInstanceFunds.plus(event.params.amount)
  
  // Set timestamps on first creation
  if (strategy.createdAt.equals(BigInt.fromI32(0))) {
    strategy.createdAt = event.block.timestamp
    strategy.createdAtBlock = event.block.number
  }
  strategy.save()

  // Update global stats
  let stats = loadOrCreateGlobalStats()
  stats.totalMarkees = stats.totalMarkees.plus(BigInt.fromI32(1))
  stats.totalFundsRaised = stats.totalFundsRaised.plus(event.params.amount)
  stats.totalTransactions = stats.totalTransactions.plus(BigInt.fromI32(1))
  stats.save()

  log.info("Markee created successfully: {} in instance '{}'", [
    markee.id, 
    strategy.instanceName
  ])
}

export function handleFundsAddedToMarkee(event: FundsAddedToMarkee): void {
  log.info("FundsAddedToMarkee: markeeAddress={}, addedBy={}, amount={}, newMarkeeTotal={}, newInstanceTotal={}", [
    event.params.markeeAddress.toHexString(),
    event.params.addedBy.toHexString(),
    event.params.amount.toString(),
    event.params.newMarkeeTotal.toString(),
    event.params.newInstanceTotal.toString()
  ])

  let markee = Markee.load(event.params.markeeAddress.toHexString())
  if (markee == null) {
    log.warning("Markee not found: {}", [event.params.markeeAddress.toHexString()])
    return
  }

  markee.totalFundsAdded = event.params.newMarkeeTotal
  markee.updatedAt = event.block.timestamp
  markee.updatedAtBlock = event.block.number
  markee.fundsAddedCount = markee.fundsAddedCount.plus(BigInt.fromI32(1))
  markee.save()

  let fundsAdded = new FundsAdded(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  )
  fundsAdded.markee = markee.id
  fundsAdded.addedBy = event.params.addedBy
  fundsAdded.amount = event.params.amount
  fundsAdded.newMarkeeTotal = event.params.newMarkeeTotal
  fundsAdded.timestamp = event.block.timestamp
  fundsAdded.blockNumber = event.block.number
  fundsAdded.transactionHash = event.transaction.hash
  fundsAdded.save()

  // Update strategy totals - use newInstanceTotal from event
  let strategy = loadOrCreateTopDawgStrategy(event.address)
  strategy.totalFundsRaised = strategy.totalFundsRaised.plus(event.params.amount)
  strategy.totalInstanceFunds = event.params.newInstanceTotal // Use the event param!
  strategy.save()

  let stats = loadOrCreateGlobalStats()
  stats.totalFundsRaised = stats.totalFundsRaised.plus(event.params.amount)
  stats.totalTransactions = stats.totalTransactions.plus(BigInt.fromI32(1))
  stats.save()

  log.info("Funds added - Markee total: {}, Instance total: {}", [
    event.params.newMarkeeTotal.toString(),
    event.params.newInstanceTotal.toString()
  ])
}

export function handleMessageUpdated(event: MessageUpdated): void {
  log.info("MessageUpdated: markeeAddress={}, updatedBy={}, newMessage={}", [
    event.params.markeeAddress.toHexString(),
    event.params.updatedBy.toHexString(),
    event.params.newMessage
  ])

  let markee = Markee.load(event.params.markeeAddress.toHexString())
  if (markee == null) {
    log.warning("Markee not found: {}", [event.params.markeeAddress.toHexString()])
    return
  }

  let messageUpdate = new MessageUpdate(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  )
  messageUpdate.markee = markee.id
  messageUpdate.updatedBy = event.params.updatedBy
  messageUpdate.oldMessage = markee.message
  messageUpdate.newMessage = event.params.newMessage
  messageUpdate.timestamp = event.block.timestamp
  messageUpdate.blockNumber = event.block.number
  messageUpdate.transactionHash = event.transaction.hash
  messageUpdate.save()

  markee.message = event.params.newMessage
  markee.updatedAt = event.block.timestamp
  markee.updatedAtBlock = event.block.number
  markee.messageUpdateCount = markee.messageUpdateCount.plus(BigInt.fromI32(1))
  markee.save()

  let stats = loadOrCreateGlobalStats()
  stats.totalTransactions = stats.totalTransactions.plus(BigInt.fromI32(1))
  stats.save()
}

export function handleNameUpdated(event: NameUpdated): void {
  log.info("NameUpdated: markeeAddress={}, updatedBy={}, newName={}", [
    event.params.markeeAddress.toHexString(),
    event.params.updatedBy.toHexString(),
    event.params.newName
  ])

  let markee = Markee.load(event.params.markeeAddress.toHexString())
  if (markee == null) {
    log.warning("Markee not found: {}", [event.params.markeeAddress.toHexString()])
    return
  }

  let nameUpdate = new NameUpdate(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  )
  nameUpdate.markee = markee.id
  nameUpdate.updatedBy = event.params.updatedBy
  nameUpdate.oldName = markee.name
  nameUpdate.newName = event.params.newName
  nameUpdate.timestamp = event.block.timestamp
  nameUpdate.blockNumber = event.block.number
  nameUpdate.transactionHash = event.transaction.hash
  nameUpdate.save()

  markee.name = event.params.newName
  markee.updatedAt = event.block.timestamp
  markee.updatedAtBlock = event.block.number
  markee.nameUpdateCount = markee.nameUpdateCount.plus(BigInt.fromI32(1))
  markee.save()

  let stats = loadOrCreateGlobalStats()
  stats.totalTransactions = stats.totalTransactions.plus(BigInt.fromI32(1))
  stats.save()
}

export function handleInstanceNameUpdated(event: InstanceNameUpdated): void {
  log.info("InstanceNameUpdated: oldName='{}', newName='{}'", [
    event.params.oldName,
    event.params.newName
  ])

  let strategy = loadOrCreateTopDawgStrategy(event.address)
  strategy.instanceName = event.params.newName
  strategy.save()

  log.info("Instance name updated for strategy {}: '{}'", [
    strategy.id,
    strategy.instanceName
  ])
}
