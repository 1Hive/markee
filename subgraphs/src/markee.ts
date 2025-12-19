import { BigInt } from "@graphprotocol/graph-ts"
import {
  MessageChanged as MessageChangedEvent,
  NameChanged as NameChangedEvent,
  FundsAdded as FundsAddedEvent
} from "../generated/templates/Markee/Markee"
import {
  Markee,
  MessageChange
} from "../generated/schema"

export function handleMessageChanged(event: MessageChangedEvent): void {
  let markee = Markee.load(event.address.toHexString())
  if (markee != null) {
    markee.message = event.params.newMessage
    markee.updatedAt = event.block.timestamp
    markee.updatedAtBlock = event.block.number
    markee.save()

    // Create message change event
    let messageChange = new MessageChange(
      event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
    )
    messageChange.markee = markee.id
    messageChange.changedBy = event.params.changedBy
    messageChange.newMessage = event.params.newMessage
    messageChange.newName = markee.name
    messageChange.timestamp = event.block.timestamp
    messageChange.blockNumber = event.block.number
    messageChange.transactionHash = event.transaction.hash
    messageChange.save()
  }
}

export function handleNameChanged(event: NameChangedEvent): void {
  let markee = Markee.load(event.address.toHexString())
  if (markee != null) {
    markee.name = event.params.newName
    markee.updatedAt = event.block.timestamp
    markee.updatedAtBlock = event.block.number
    markee.save()
  }
}

export function handleFundsAdded(event: FundsAddedEvent): void {
  let markee = Markee.load(event.address.toHexString())
  if (markee != null) {
    markee.totalFundsAdded = event.params.newTotal
    markee.updatedAt = event.block.timestamp
    markee.updatedAtBlock = event.block.number
    markee.save()
  }
}
