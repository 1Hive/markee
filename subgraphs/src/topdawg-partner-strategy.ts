import { BigInt, Bytes } from "@graphprotocol/graph-ts"
import {
  MarkeeCreated as MarkeeCreatedEvent,
  FundsAddedToMarkee as FundsAddedToMarkeeEvent,
  MessageUpdated as MessageUpdatedEvent,
  NameUpdated as NameUpdatedEvent,
  InstanceNameUpdated as InstanceNameUpdatedEvent,
  BeneficiaryAddressUpdated as BeneficiaryAddressUpdatedEvent,
  PercentToBeneficiaryUpdated as PercentToBeneficiaryUpdatedEvent
} from "../generated/TopDawgPartnerStrategyGardens/TopDawgPartnerStrategy"
import { Markee as MarkeeTemplate } from "../generated/templates"
import {
  Markee,
  TopDawgPartnerStrategy,
  PartnerFundsAdded,
  MessageUpdate,
  NameUpdate,
  GlobalStats
} from "../generated/schema"
import { TopDawgPartnerStrategy as PartnerStrategyContract } from "../generated/TopDawgPartnerStrategyGardens/TopDawgPartnerStrategy"

export function handlePartnerMarkeeCreated(event: MarkeeCreatedEvent): void {
  let strategy = TopDawgPartnerStrategy.load(event.address.toHex())
  
  if (strategy == null) {
    strategy = new TopDawgPartnerStrategy(event.address.toHex())
    strategy.address = event.address
    
    // Bind to the TopDawgPartnerStrategy contract to read configuration
    let contract = PartnerStrategyContract.bind(event.address)
    
    // Read strategy configuration
    strategy.instanceName = contract.instanceName()
    strategy.beneficiaryAddress = contract.beneficiaryAddress()
    strategy.percentToBeneficiary = contract.percentToBeneficiary()
    strategy.minimumPrice = contract.minimumPrice()
    strategy.maxMessageLength = contract.maxMessageLength()
    strategy.maxNameLength = contract.maxNameLength()
    
    strategy.totalMarkeesCreated = BigInt.fromI32(0)
    strategy.totalFundsRaised = BigInt.fromI32(0)
    strategy.totalBeneficiaryFunds = BigInt.fromI32(0)
    strategy.totalRevNetFunds = BigInt.fromI32(0)
    strategy.totalInstanceFunds = BigInt.fromI32(0)
    strategy.createdAt = event.block.timestamp
    strategy.createdAtBlock = event.block.number
  }

  // Create Markee entity
  let markee = new Markee(event.params.markeeAddress.toHex())
  markee.address = event.params.markeeAddress
  markee.owner = event.params.owner
  markee.message = event.params.message
  markee.name = event.params.name
  markee.totalFundsAdded = event.params.amount
  markee.pricingStrategy = event.address
  markee.partnerStrategy = strategy.id
  markee.createdAt = event.block.timestamp
  markee.createdAtBlock = event.block.number
  markee.updatedAt = event.block.timestamp
  markee.updatedAtBlock = event.block.number
  markee.fundsAddedCount = BigInt.fromI32(0)
  markee.messageUpdateCount = BigInt.fromI32(0)
  markee.nameUpdateCount = BigInt.fromI32(0)
  markee.save()

  // Update strategy stats
  strategy.totalMarkeesCreated = strategy.totalMarkeesCreated.plus(BigInt.fromI32(1))
  strategy.totalFundsRaised = strategy.totalFundsRaised.plus(event.params.amount)
  strategy.totalBeneficiaryFunds = strategy.totalBeneficiaryFunds.plus(event.params.beneficiaryAmount)
  strategy.totalRevNetFunds = strategy.totalRevNetFunds.plus(event.params.revNetAmount)
  strategy.totalInstanceFunds = strategy.totalInstanceFunds.plus(event.params.amount)
  strategy.save()

  // Create PartnerFundsAdded event
  let fundsAdded = new PartnerFundsAdded(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  )
  fundsAdded.markee = markee.id
  fundsAdded.addedBy = event.params.owner
  fundsAdded.amount = event.params.amount
  fundsAdded.beneficiaryAmount = event.params.beneficiaryAmount
  fundsAdded.revNetAmount = event.params.revNetAmount
  fundsAdded.newMarkeeTotal = event.params.amount
  fundsAdded.timestamp = event.block.timestamp
  fundsAdded.blockNumber = event.block.number
  fundsAdded.transactionHash = event.transaction.hash
  fundsAdded.save()

  // Update global stats
  let stats = GlobalStats.load("global")
  if (stats == null) {
    stats = new GlobalStats("global")
    stats.totalMarkees = BigInt.fromI32(0)
    stats.totalFundsRaised = BigInt.fromI32(0)
    stats.totalTransactions = BigInt.fromI32(0)
    stats.totalFixedPriceRevenue = BigInt.fromI32(0)
    stats.totalFixedPriceChanges = BigInt.fromI32(0)
    stats.totalPartnerFunds = BigInt.fromI32(0)
    stats.totalPartnerBeneficiaryFunds = BigInt.fromI32(0)
  }
  stats.totalMarkees = stats.totalMarkees.plus(BigInt.fromI32(1))
  stats.totalFundsRaised = stats.totalFundsRaised.plus(event.params.amount)
  stats.totalTransactions = stats.totalTransactions.plus(BigInt.fromI32(1))
  stats.totalPartnerFunds = stats.totalPartnerFunds.plus(event.params.amount)
  stats.totalPartnerBeneficiaryFunds = stats.totalPartnerBeneficiaryFunds.plus(event.params.beneficiaryAmount)
  stats.save()

  // Start tracking this Markee contract
  MarkeeTemplate.create(event.params.markeeAddress)
}

export function handlePartnerFundsAddedToMarkee(event: FundsAddedToMarkeeEvent): void {
  let markee = Markee.load(event.params.markeeAddress.toHex())
  if (markee == null) {
    return
  }

  // Update markee
  markee.totalFundsAdded = event.params.newMarkeeTotal
  markee.fundsAddedCount = markee.fundsAddedCount.plus(BigInt.fromI32(1))
  markee.updatedAt = event.block.timestamp
  markee.updatedAtBlock = event.block.number
  markee.save()

  // Update strategy stats
  let strategy = TopDawgPartnerStrategy.load(event.address.toHex())
  if (strategy != null) {
    strategy.totalFundsRaised = strategy.totalFundsRaised.plus(event.params.amount)
    strategy.totalBeneficiaryFunds = strategy.totalBeneficiaryFunds.plus(event.params.beneficiaryAmount)
    strategy.totalRevNetFunds = strategy.totalRevNetFunds.plus(event.params.revNetAmount)
    strategy.totalInstanceFunds = event.params.newInstanceTotal
    strategy.save()
  }

  // Create PartnerFundsAdded event
  let fundsAdded = new PartnerFundsAdded(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  )
  fundsAdded.markee = markee.id
  fundsAdded.addedBy = event.params.addedBy
  fundsAdded.amount = event.params.amount
  fundsAdded.beneficiaryAmount = event.params.beneficiaryAmount
  fundsAdded.revNetAmount = event.params.revNetAmount
  fundsAdded.newMarkeeTotal = event.params.newMarkeeTotal
  fundsAdded.timestamp = event.block.timestamp
  fundsAdded.blockNumber = event.block.number
  fundsAdded.transactionHash = event.transaction.hash
  fundsAdded.save()

  // Update global stats
  let stats = GlobalStats.load("global")
  if (stats == null) {
    stats = new GlobalStats("global")
    stats.totalMarkees = BigInt.fromI32(0)
    stats.totalFundsRaised = BigInt.fromI32(0)
    stats.totalTransactions = BigInt.fromI32(0)
    stats.totalFixedPriceRevenue = BigInt.fromI32(0)
    stats.totalFixedPriceChanges = BigInt.fromI32(0)
    stats.totalPartnerFunds = BigInt.fromI32(0)
    stats.totalPartnerBeneficiaryFunds = BigInt.fromI32(0)
  }
  stats.totalFundsRaised = stats.totalFundsRaised.plus(event.params.amount)
  stats.totalTransactions = stats.totalTransactions.plus(BigInt.fromI32(1))
  stats.totalPartnerFunds = stats.totalPartnerFunds.plus(event.params.amount)
  stats.totalPartnerBeneficiaryFunds = stats.totalPartnerBeneficiaryFunds.plus(event.params.beneficiaryAmount)
  stats.save()
}

export function handlePartnerMessageUpdated(event: MessageUpdatedEvent): void {
  let markee = Markee.load(event.params.markeeAddress.toHex())
  if (markee == null) {
    return
  }

  // Create MessageUpdate event
  let update = new MessageUpdate(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  )
  update.markee = markee.id
  update.updatedBy = event.params.updatedBy
  update.oldMessage = markee.message
  update.newMessage = event.params.newMessage
  update.timestamp = event.block.timestamp
  update.blockNumber = event.block.number
  update.transactionHash = event.transaction.hash
  update.save()

  // Update markee
  markee.message = event.params.newMessage
  markee.messageUpdateCount = markee.messageUpdateCount.plus(BigInt.fromI32(1))
  markee.updatedAt = event.block.timestamp
  markee.updatedAtBlock = event.block.number
  markee.save()

  // Update global stats
  let stats = GlobalStats.load("global")
  if (stats != null) {
    stats.totalTransactions = stats.totalTransactions.plus(BigInt.fromI32(1))
    stats.save()
  }
}

export function handlePartnerNameUpdated(event: NameUpdatedEvent): void {
  let markee = Markee.load(event.params.markeeAddress.toHex())
  if (markee == null) {
    return
  }

  // Create NameUpdate event
  let update = new NameUpdate(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  )
  update.markee = markee.id
  update.updatedBy = event.params.updatedBy
  update.oldName = markee.name
  update.newName = event.params.newName
  update.timestamp = event.block.timestamp
  update.blockNumber = event.block.number
  update.transactionHash = event.transaction.hash
  update.save()

  // Update markee
  markee.name = event.params.newName
  markee.nameUpdateCount = markee.nameUpdateCount.plus(BigInt.fromI32(1))
  markee.updatedAt = event.block.timestamp
  markee.updatedAtBlock = event.block.number
  markee.save()

  // Update global stats
  let stats = GlobalStats.load("global")
  if (stats != null) {
    stats.totalTransactions = stats.totalTransactions.plus(BigInt.fromI32(1))
    stats.save()
  }
}

export function handlePartnerInstanceNameUpdated(event: InstanceNameUpdatedEvent): void {
  let strategy = TopDawgPartnerStrategy.load(event.address.toHex())
  if (strategy != null) {
    strategy.instanceName = event.params.newName
    strategy.save()
  }
}

export function handleBeneficiaryAddressUpdated(event: BeneficiaryAddressUpdatedEvent): void {
  let strategy = TopDawgPartnerStrategy.load(event.address.toHex())
  if (strategy != null) {
    strategy.beneficiaryAddress = event.params.newBeneficiary
    strategy.save()
  }
}

export function handlePercentToBeneficiaryUpdated(event: PercentToBeneficiaryUpdatedEvent): void {
  let strategy = TopDawgPartnerStrategy.load(event.address.toHex())
  if (strategy != null) {
    strategy.percentToBeneficiary = event.params.newPercent
    strategy.save()
  }
}
