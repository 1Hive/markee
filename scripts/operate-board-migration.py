#!/usr/bin/env python3
"""Inventory or migrate Base boards with the configured Foundry operator keystore.

Dry run is the default. Live writes require --execute and the keystore password
in an environment variable. Re-running skips finished boards and resumes pages.
"""

import argparse
import json
import os
import pathlib
import subprocess
import sys
import tempfile

SAFE = "0xaf4401e765dff079ab6021bbb8d46e53e27613db"
BASE_CHAIN_ID = 8453
MAX_TX_GAS = 16_777_216
DEFAULT_GAS_BUDGET = 14_000_000


def cast(*args, rpc=None):
    command = ["cast", *map(str, args)]
    if rpc and command[1] not in ("wallet",):
        command += ["--rpc-url", rpc]
    result = subprocess.run(command, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "cast failed")
    return result.stdout.strip()


def read(address, signature, *args, rpc):
    value = json.loads(cast("call", address, signature, *args, "--json", rpc=rpc))
    return value[0]


def estimate(address, signature, *args, rpc, operator):
    return int(cast("estimate", address, signature, *args, "--from", operator, rpc=rpc))


def send(address, signature, *args, rpc, account, password_file, gas):
    limit = min(MAX_TX_GAS, (gas * 115 + 99) // 100)
    receipt = json.loads(cast(
        "send", address, signature, *args, "--account", account,
        "--password-file", password_file, "--gas-limit", limit, "--json", rpc=rpc,
    ))
    if int(receipt.get("status", "0"), 16) != 1:
        raise RuntimeError(f"transaction failed: {receipt.get('transactionHash')}")
    print(f"  confirmed {receipt['transactionHash']} gas={int(receipt['gasUsed'], 16):,}", flush=True)


def require_address(value, label):
    if not isinstance(value, str) or not value.startswith("0x") or len(value) != 42:
        raise ValueError(f"{label} must be a deployed address")
    int(value[2:], 16)
    if int(value, 16) == 0:
        raise ValueError(f"{label} cannot be zero")
    return value


def inventory(factory, rpc):
    count = int(read(factory, "leaderboardCount()(uint256)", rpc=rpc))
    boards = []
    for offset in range(0, count, 50):
        boards += read(factory, "getLeaderboards(uint256,uint256)(address[])", offset,
                       min(50, count - offset), rpc=rpc)
    if len(boards) != count or len({x.lower() for x in boards}) != count:
        raise RuntimeError(f"factory registry is inconsistent: {factory}")
    return boards


def checked_estimate(address, signature, args, options):
    try:
        gas = estimate(address, signature, *args, rpc=options.rpc, operator=options.operator)
        return gas if gas <= options.gas_budget else None
    except RuntimeError:
        return None


def perform(address, signature, args, gas, options):
    if gas is None:
        raise RuntimeError(f"{signature} cannot be estimated within the gas budget")
    if options.execute:
        send(address, signature, *args, rpc=options.rpc, account=options.account,
             password_file=options.password_file, gas=gas)
    else:
        print(f"  plan {signature} {list(args)} estimated={gas:,} gas")


def migrate_board(board, migrator, options):
    status = int(read(migrator, "status(address)(uint8)", board, rpc=options.rpc))
    if status == 2:
        return "finished"
    count = int(read(board, "markeeCount()(uint256)", rpc=options.rpc))
    print(f"board={board} markees={count} status={status}", flush=True)
    if status == 0:
        gas = checked_estimate(migrator, "migrate(address)", (board,), options)
        if gas is not None:
            perform(migrator, "migrate(address)", (board,), gas, options)
            if options.execute and int(read(migrator, "status(address)(uint8)", board, rpc=options.rpc)) != 2:
                raise RuntimeError("one-shot migration did not finish")
            return "one-shot"
        gas = checked_estimate(migrator, "startMigration(address)", (board,), options)
        perform(migrator, "startMigration(address)", (board,), gas, options)
        if not options.execute:
            print("  pages can be estimated after startMigration executes")
            return "paged-plan"

    offset = 0
    while offset < count:
        size = min(options.page_size, count - offset)
        gas = None
        while size:
            gas = checked_estimate(migrator, "importMarkees(address,uint256,uint256)",
                                   (board, offset, size), options)
            if gas is not None:
                break
            size //= 2
        if not size:
            raise RuntimeError(f"cannot import even one Markee at offset {offset}")
        perform(migrator, "importMarkees(address,uint256,uint256)", (board, offset, size), gas, options)
        offset += size

    if not options.execute:
        print("  plan finishMigration(address) after the import pages execute")
        return "paged-plan"
    gas = checked_estimate(migrator, "finishMigration(address)", (board,), options)
    perform(migrator, "finishMigration(address)", (board,), gas, options)
    if options.execute and int(read(migrator, "status(address)(uint8)", board, rpc=options.rpc)) != 2:
        raise RuntimeError("paged migration did not finish")
    return "paged"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, type=pathlib.Path)
    parser.add_argument("--factory", required=True, help="streaming, superfluid, openinternet, github, or forsale")
    parser.add_argument("--rpc", default=os.getenv("BASE_RPC_URL"))
    parser.add_argument("--account", default="MARKEE_GNOSIS_DELIVERY")
    parser.add_argument("--password-env", default="KEYSTORE_PASSWORD")
    parser.add_argument("--gas-budget", type=int, default=DEFAULT_GAS_BUDGET)
    parser.add_argument("--page-size", type=int, default=20)
    parser.add_argument("--max-boards", type=int, help="process at most this many registered boards")
    parser.add_argument("--execute", action="store_true")
    options = parser.parse_args()
    if not options.rpc:
        parser.error("set BASE_RPC_URL or pass --rpc")
    if not 0 < options.gas_budget <= DEFAULT_GAS_BUDGET:
        parser.error(f"gas budget must be 1..{DEFAULT_GAS_BUDGET}")
    if not 0 < options.page_size <= 20:
        parser.error("page size must be 1..20")
    if options.max_boards is not None and options.max_boards <= 0:
        parser.error("max boards must be positive")
    config = json.loads(options.config.read_text())
    if int(cast("chain-id", rpc=options.rpc)) != BASE_CHAIN_ID:
        raise RuntimeError("RPC is not Base mainnet")
    options.operator = require_address(config["operator"], "operator")
    if options.operator.lower() != "0x9fcbc092b770970a58524136ef6202ca2caa0d73":
        raise RuntimeError("config operator differs from MARKEE_GNOSIS_DELIVERY")
    entry = config["factories"][options.factory]
    factory = require_address(entry["legacyFactory"], "legacyFactory")
    migrator = require_address(entry["migrator"], "migrator")
    if cast("code", migrator, rpc=options.rpc) == "0x":
        raise RuntimeError("migrator is not deployed")
    if read(migrator, "owner()(address)", rpc=options.rpc).lower() != SAFE:
        raise RuntimeError("Safe has not accepted migrator ownership")
    if not read(migrator, "isOperator(address)(bool)", options.operator, rpc=options.rpc):
        raise RuntimeError("configured wallet is not a migrator operator")
    if not read(migrator, "isSourceFactory(address)(bool)", factory, rpc=options.rpc):
        raise RuntimeError("legacy factory is not an approved source")
    if options.factory == "streaming":
        if read(factory, "leaderboardImplementation()(address)", rpc=options.rpc).lower() != \
                require_address(entry["forwarder"], "forwarder").lower():
            raise RuntimeError("streaming factory has not switched to the new forwarder")
    else:
        if read(migrator, "TARGET_FACTORY()(address)", rpc=options.rpc).lower() != \
                require_address(entry["newFactory"], "newFactory").lower():
            raise RuntimeError("migrator targets another factory")
        if not read(factory, "revNetEnabled()(bool)", rpc=options.rpc) or \
                read(factory, "revNetTerminal()(address)", rpc=options.rpc).lower() != \
                require_address(entry["sunsetTerminal"], "sunsetTerminal").lower():
            raise RuntimeError("legacy factory must be frozen by the Safe before migration")

    options.password_file = None
    try:
        if options.execute:
            password = os.getenv(options.password_env)
            if not password:
                raise RuntimeError(f"{options.password_env} is unavailable")
            with tempfile.NamedTemporaryFile(mode="w", prefix="markee-keystore-", delete=False) as file:
                options.password_file = file.name
                os.chmod(file.name, 0o600)
                file.write(password)
            wallet = cast("wallet", "address", "--account", options.account,
                          "--password-file", options.password_file)
            if wallet.lower() != options.operator.lower():
                raise RuntimeError("Foundry keystore address does not match operator")

        boards = inventory(factory, options.rpc)
        print(f"{options.factory}: {len(boards)} registered boards; execute={options.execute}", flush=True)
        selected = boards[:options.max_boards] if options.max_boards else boards
        for index, board in enumerate(selected, 1):
            print(f"[{index}/{len(boards)}] ", end="", flush=True)
            result = migrate_board(board, migrator, options)
            if result == "finished":
                print(f"board={board} already finished")
    finally:
        if options.password_file:
            pathlib.Path(options.password_file).unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        main()
    except (KeyError, ValueError, RuntimeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
