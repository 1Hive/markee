import { BigInt, log } from "@graphprotocol/graph-ts"
import {
  MessageChanged,
  NameChanged,
  FundsAdded as FundsAddedEvent
} from "../generated/templates/Markee/Markee"
import { Markee, MessageUpdate, NameUpdate, FundsAdded, GlobalStats } from "../generated/schema"

// Helper function to load or create GlobalStats
function loadOrCreateGlobalStats(): GlobalStats {
  let stats = GlobalStats.load("1")
  if (stats == null) {
    stats = new GlobalStats("1")
    stats.totalMarkees = BigInt.fromI32(0)
    stats.totalFundsRaised = BigInt.fromI32(0)
    stats.totalTransactions = BigInt.fromI32(0)
  }
  return stats
}

export function handleMessageChanged(event: MessageChanged): void {
  log.info("MessageChanged event from Markee contract: newMessage={}", [
    event.params.newMessage
  ])

  // Load Markee entity
  let markee = Markee.load(event.address.toHexString())
  if (markee == null) {
    log.warning("Markee not found: {}", [event.address.toHexString()])
    return
  }

  // Create MessageUpdate event
  let messageUpdate = new MessageUpdate(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  )
  messageUpdate.markee = markee.id
  messageUpdate.updatedBy = event.params.changedBy
  messageUpdate.oldMessage = markee.message
  messageUpdate.newMessage = event.params.newMessage
  messageUpdate.timestamp = event.block.timestamp
  messageUpdate.blockNumber = event.block.number
  messageUpdate.transactionHash = event.transaction.hash
  messageUpdate.save()

  // Update Markee
  markee.message = event.params.newMessage
  markee.updatedAt = event.block.timestamp
  markee.messageUpdateCount = markee.messageUpdateCount.plus(BigInt.fromI32(1))
  markee.save()

  // Update global stats
  let stats = loadOrCreateGlobalStats()
  stats.totalTransactions = stats.totalTransactions.plus(BigInt.fromI32(1))
  stats.save()
}

export function handleNameChanged(event: NameChanged): void {
  log.info("NameChanged event from Markee contract: newName={}", [
    event.params.newName
  ])

  // Load Markee entity
  let markee = Markee.load(event.address.toHexString())
  if (markee == null) {
    log.warning("Markee not found: {}", [event.address.toHexString()])
    return
  }

  // Create NameUpdate event
  let nameUpdate = new NameUpdate(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  )
  nameUpdate.markee = markee.id
  nameUpdate.updatedBy = event.params.changedBy
  nameUpdate.oldName = markee.name
  nameUpdate.newName = event.params.newName
  nameUpdate.timestamp = event.block.timestamp
  nameUpdate.blockNumber = event.block.number
  nameUpdate.transactionHash = event.transaction.hash
  nameUpdate.save()

  // Update Markee
  markee.name = event.params.newName
  markee.updatedAt = event.block.timestamp
  markee.save()

  // Update global stats
  let stats = loadOrCreateGlobalStats()
  stats.totalTransactions = stats.totalTransactions.plus(BigInt.fromI32(1))
  stats.save()
}

export function handleFundsAdded(event: FundsAddedEvent): void {
  log.info("FundsAdded event from Markee contract: amount={}, newTotal={}", [
    event.params.amount.toString(),
    event.params.newTotal.toString()
  ])

  // Load Markee entity
  let markee = Markee.load(event.address.toHexString())
  if (markee == null) {
    log.warning("Markee not found: {}", [event.address.toHexString()])
    return
  }

  // Update Markee
  markee.totalFundsAdded = event.params.newTotal
  markee.updatedAt = event.block.timestamp
  markee.fundsAddedCount = markee.fundsAddedCount.plus(BigInt.fromI32(1))
  markee.save()

  // Create FundsAdded event
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

  // Update global stats
  let stats = loadOrCreateGlobalStats()
  stats.totalFundsRaised = stats.totalFundsRaised.plus(event.params.amount)
  stats.totalTransactions = stats.totalTransactions.plus(BigInt.fromI32(1))
  stats.save()
}
