#!/usr/bin/env python3
"""Turn a confirmed DeployBoardBeacons broadcast into Safe batches and operator config."""

import argparse
import json
import pathlib
import subprocess
import sys
import time

SAFE = "0xAf4401E765dFf079aB6021BBb8d46E53E27613DB"
OPERATOR = "0x9fcbc092b770970a58524136ef6202ca2caa0d73"
STREAMING_FACTORY = "0x37f420fdE5c98e611EB7cb9b74ef579D84697039"
LEGACY_FACTORIES = {
    "superfluid": "0xC497187AAa35C26b0008B43C10A6F6300b7eBcad",
    "openinternet": "0xFD488A0fE8D4Fa99B4A6016EA9C49a860A553F7c",
    "github": "0xdF2A716452a3960619cDdDCDe4E10eACcFFDa0A2",
    "forsale": "0x861D9897eC47421aAFB6321Ee219E88ab485121f",
}
PLATFORM_IDS = {"superfluid": "superfluid", "openinternet": "openinternet",
                "github": "github", "forsale": "for-sale"}


def address(value):
    if not isinstance(value, str) or len(value) != 42 or not value.startswith("0x"):
        raise ValueError(f"invalid address: {value}")
    int(value[2:], 16)
    return value


def unique(items, label):
    if len(items) != 1:
        raise ValueError(f"expected one {label}, found {len(items)}")
    return items[0]


def parse_broadcast(data, require_receipts=True):
    if int(data.get("chain", -1)) != 8453 or data.get("pending"):
        raise ValueError("broadcast must be complete on Base mainnet")
    txs = data["transactions"]
    receipts = data.get("receipts", [])
    if require_receipts:
        if len(receipts) != len(txs) or not receipts:
            raise ValueError("every deployment transaction needs a confirmed receipt")
        if any(int(r.get("status", "0"), 16) != 1 for r in receipts):
            raise ValueError("a deployment transaction failed")
        sent_hashes = {x.get("hash", "").lower() for x in txs}
        mined_hashes = {x.get("transactionHash", "").lower() for x in receipts}
        if sent_hashes != mined_hashes:
            raise ValueError("deployment receipts do not match the broadcast transactions")
    creates = [x for x in txs if x.get("transactionType") == "CREATE"]
    def named(name):
        return [x for x in creates if x.get("contractName") == name]
    def created(tx):
        return address(tx["contractAddress"])

    streaming_migrator = unique(named("StreamingBoardMigrator"), "streaming migrator")
    if address(streaming_migrator["arguments"][0]).lower() != OPERATOR or \
            address(streaming_migrator["arguments"][1]).lower() != STREAMING_FACTORY.lower():
        raise ValueError("streaming migrator owner or source factory differs from expected")
    streaming_forwarder = unique([x for x in named("BeaconForwarder")
                                  if x.get("arguments", [None, None])[1] == "true"], "streaming forwarder")
    markee = created(unique(named("Markee"), "Markee implementation"))
    config = {"operator": OPERATOR, "factories": {
        "streaming": {"legacyFactory": STREAMING_FACTORY, "migrator": created(streaming_migrator),
                      "forwarder": created(streaming_forwarder)}
    }}
    for name, legacy in LEGACY_FACTORIES.items():
        factory_tx = unique([x for x in named("LeaderboardFactory")
                             if x.get("arguments", [None, None])[1] == PLATFORM_IDS[name]], name + " factory")
        factory = created(factory_tx)
        if address(factory_tx["arguments"][6]).lower() != SAFE.lower() or \
                address(factory_tx["arguments"][7]).lower() != OPERATOR:
            raise ValueError(f"{name} factory fee receiver or initial admin differs")
        migrator_tx = unique([x for x in named("LeaderboardMigrator")
                              if x.get("arguments", [None, None])[1].lower() == factory.lower()], name + " migrator")
        if address(migrator_tx["arguments"][0]).lower() != OPERATOR:
            raise ValueError(f"{name} migrator initial owner differs")
        migrator = created(migrator_tx)
        sunset = created(unique([x for x in named("SunsetTerminal")
                                 if x.get("arguments", [None])[0].lower() == migrator.lower()], name + " sunset"))
        config["factories"][name] = {"legacyFactory": legacy, "migrator": migrator,
                                     "newFactory": factory, "sunsetTerminal": sunset}
    operators = [x for x in txs if (x.get("function") or "").startswith("setOperator(")]
    if len(operators) != 5 or any(address(x["arguments"][0]).lower() != OPERATOR or
                                  str(x["arguments"][1]).lower() != "true" for x in operators):
        raise ValueError("operator was not enabled on every migrator")
    ownership = [x for x in txs if (x.get("function") or "").startswith("transferOwnership(")]
    admins = [x for x in txs if (x.get("function") or "").startswith("setFactoryAdmin(")]
    if len(ownership) != 5 or len(admins) != 4 or any(
        address(x["arguments"][0]).lower() != SAFE.lower() for x in ownership + admins
    ):
        raise ValueError("Safe handoff was not started on every contract")
    return config, markee


def calldata(signature, *args):
    result = subprocess.run(["cast", "calldata", signature, *args], text=True,
                            capture_output=True, check=True)
    return result.stdout.strip()


def transaction(to, signature, *args):
    return {"to": to, "value": "0", "data": calldata(signature, *args),
            "contractMethod": None, "contractInputsValues": None}


def batch(name, transactions):
    return {"version": "1.0", "chainId": "8453", "createdAt": int(time.time() * 1000),
            "meta": {"name": name, "description": "Markee PR #66 Base rollout",
                     "txBuilderVersion": "1.18.0", "createdFromSafeAddress": SAFE,
                     "createdFromOwnerAddress": ""}, "transactions": transactions}


def build_batches(config, markee):
    factories = config["factories"]
    handoff = [transaction(STREAMING_FACTORY, "setImplementations(address,address)",
                           factories["streaming"]["forwarder"], markee)]
    for entry in factories.values():
        handoff.append(transaction(entry["migrator"], "acceptOwnership()"))
    for name in LEGACY_FACTORIES:
        handoff.append(transaction(factories[name]["newFactory"], "acceptFactoryAdmin()"))
    batches = {"safe-handoff.json": batch("Markee beacon handoff", handoff)}
    for name in LEGACY_FACTORIES:
        entry = factories[name]
        batches[f"safe-freeze-{name}.json"] = batch(f"Markee freeze {name}", [
            transaction(entry["legacyFactory"], "setRevNetTerminal(address)", entry["sunsetTerminal"]),
            transaction(entry["legacyFactory"], "setRevNetEnabled(bool)", "true"),
        ])
    return batches


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("broadcast", type=pathlib.Path, help="confirmed run-latest.json, not dry-run")
    parser.add_argument("--out-dir", required=True, type=pathlib.Path)
    args = parser.parse_args()
    config, markee = parse_broadcast(json.loads(args.broadcast.read_text()))
    batches = build_batches(config, markee)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "board-migration.base.json").write_text(json.dumps(config, indent=2) + "\n")
    for filename, content in batches.items():
        (args.out_dir / filename).write_text(json.dumps(content, indent=2) + "\n")
    print(f"Wrote operator config and {len(batches)} Safe Transaction Builder batches to {args.out_dir}")
    print("Import the handoff batch only after verifying deployed code and pending ownership.")
    print("Import each factory freeze batch immediately before migrating that factory.")


if __name__ == "__main__":
    try:
        main()
    except (KeyError, IndexError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
