import { BigInt, Address, log } from "@graphprotocol/graph-ts"
import {
  MarkeeCreated,
  FundsAddedToMarkee,
  MessageUpdated,
  NameUpdated
} from "../generated/InvestorStrategy/InvestorStrategy"
import { Markee as MarkeeContract } from "../generated/InvestorStrategy/Markee"
import { Markee as MarkeeTemplate } from "../generated/templates"
import {
  Markee,
  InvestorStrategy,
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
    stats.save()
  }
  return stats
}

// Helper: load or create InvestorStrategy
function loadOrCreateInvestorStrategy(address: Address): InvestorStrategy {
  let strategy = InvestorStrategy.load(address.toHexString())
  if (strategy == null) {
    strategy = new InvestorStrategy(address.toHexString())
    strategy.address = address
    strategy.minimumPrice = BigInt.fromI32(0)
    strategy.maxMessageLength = BigInt.fromI32(0)
    strategy.maxNameLength = BigInt.fromI32(0)
    strategy.totalMarkeesCreated = BigInt.fromI32(0)
    strategy.totalFundsRaised = BigInt.fromI32(0)
    strategy.save()
  }
  return strategy
}

export function handleMarkeeCreated(event: MarkeeCreated): void {
  log.info("MarkeeCreated event: markeeAddress={}, owner={}, message={}", [
    event.params.markeeAddress.toHexString(),
    event.params.owner.toHexString(),
    event.params.message
  ])

  // Create the root Markee entity if it doesn't exist
  let markee = Markee.load(event.params.markeeAddress.toHexString())
  if (markee == null) {
    markee = new Markee(event.params.markeeAddress.toHexString())
    markee.address = event.params.markeeAddress
    markee.owner = event.params.owner
    markee.message = event.params.message
    markee.name = event.params.name
    markee.totalFundsAdded = event.params.amount
    markee.pricingStrategy = event.address
    markee.chainId = BigInt.fromI32(10) // Optimism
    markee.createdAt = event.block.timestamp
    markee.createdAtBlock = event.block.number
    markee.updatedAt = event.block.timestamp
    markee.fundsAddedCount = BigInt.fromI32(1)
    markee.messageUpdateCount = BigInt.fromI32(0)
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
  fundsAdded.newTotal = event.params.amount
  fundsAdded.timestamp = event.block.timestamp
  fundsAdded.blockNumber = event.block.number
  fundsAdded.transactionHash = event.transaction.hash
  fundsAdded.save()

  // Update InvestorStrategy stats
  let strategy = loadOrCreateInvestorStrategy(event.address)
  strategy.totalMarkeesCreated = strategy.totalMarkeesCreated.plus(BigInt.fromI32(1))
  strategy.totalFundsRaised = strategy.totalFundsRaised.plus(event.params.amount)
  strategy.save()

  // Update global stats
  let stats = loadOrCreateGlobalStats()
  stats.totalMarkees = stats.totalMarkees.plus(BigInt.fromI32(1))
  stats.totalFundsRaised = stats.totalFundsRaised.plus(event.params.amount)
  stats.totalTransactions = stats.totalTransactions.plus(BigInt.fromI32(1))
  stats.save()
}

export function handleFundsAddedToMarkee(event: FundsAddedToMarkee): void {
  log.info("FundsAddedToMarkee: markeeAddress={}, addedBy={}, amount={}", [
    event.params.markeeAddress.toHexString(),
    event.params.addedBy.toHexString(),
    event.params.amount.toString()
  ])

  let markee = Markee.load(event.params.markeeAddress.toHexString())
  if (markee == null) {
    log.warning("Markee not found: {}", [event.params.markeeAddress.toHexString()])
    return
  }

  markee.totalFundsAdded = event.params.newTotal
  markee.updatedAt = event.block.timestamp
  markee.fundsAddedCount = markee.fundsAddedCount.plus(BigInt.fromI32(1))
  markee.save()

  let fundsAdded = new FundsAdded(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  )
  fundsAdded.markee = markee.id
  fundsAdded.addedBy = event.params.addedBy
  fundsAdded.amount = event.params.amount
  fundsAdded.newTotal = event.params.newTotal
  fundsAdded.timestamp = event.block.timestamp
  fundsAdded.blockNumber = event.block.number
  fundsAdded.transactionHash = event.transaction.hash
  fundsAdded.save()

  let strategy = loadOrCreateInvestorStrategy(event.address)
  strategy.totalFundsRaised = strategy.totalFundsRaised.plus(event.params.amount)
  strategy.save()

  let stats = loadOrCreateGlobalStats()
  stats.totalFundsRaised = stats.totalFundsRaised.plus(event.params.amount)
  stats.totalTransactions = stats.totalTransactions.plus(BigInt.fromI32(1))
  stats.save()
}

export function handleMessageUpdated(event: MessageUpdated): void {
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
  markee.messageUpdateCount = markee.messageUpdateCount.plus(BigInt.fromI32(1))
  markee.save()

  let stats = loadOrCreateGlobalStats()
  stats.totalTransactions = stats.totalTransactions.plus(BigInt.fromI32(1))
  stats.save()
}

export function handleNameUpdated(event: NameUpdated): void {
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
  markee.save()

  let stats = loadOrCreateGlobalStats()
  stats.totalTransactions = stats.totalTransactions.plus(BigInt.fromI32(1))
  stats.save()
}
