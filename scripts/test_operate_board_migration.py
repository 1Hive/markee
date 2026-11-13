import importlib.util
import pathlib
import types
import unittest
from unittest import mock


SOURCE = pathlib.Path(__file__).with_name("operate-board-migration.py")
SPEC = importlib.util.spec_from_file_location("board_migration", SOURCE)
migration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(migration)
ROLLOUT_SPEC = importlib.util.spec_from_file_location("board_rollout", SOURCE.with_name("prepare-board-rollout.py"))
rollout = importlib.util.module_from_spec(ROLLOUT_SPEC)
ROLLOUT_SPEC.loader.exec_module(rollout)


class OperatorMigrationTests(unittest.TestCase):
    def setUp(self):
        self.board = "0x" + "1" * 40
        self.migrator = "0x" + "2" * 40
        self.options = types.SimpleNamespace(
            rpc="unused", operator="0x" + "3" * 40, execute=True,
            account="test", password_file="unused", page_size=20,
            gas_budget=14_000_000,
        )

    def test_small_board_is_one_shot_and_checked_after_receipt(self):
        reads = iter([0, 3, 2])
        with mock.patch.object(migration, "read", side_effect=lambda *a, **k: next(reads)), \
             mock.patch.object(migration, "checked_estimate", return_value=2_000_000), \
             mock.patch.object(migration, "send") as send:
            result = migration.migrate_board(self.board, self.migrator, self.options)
        self.assertEqual(result, "one-shot")
        self.assertEqual(send.call_args.args[:3],
                         (self.migrator, "migrate(address)", self.board))

    def test_large_board_uses_adaptive_pages_and_resumes(self):
        reads = iter([1, 21, 2])  # Already started, 21 Markees, then finished.

        def gas(address, signature, args, options):
            if signature == "importMarkees(address,uint256,uint256)":
                return 2_000_000 if args[2] <= 10 else None
            return 100_000

        with mock.patch.object(migration, "read", side_effect=lambda *a, **k: next(reads)), \
             mock.patch.object(migration, "checked_estimate", side_effect=gas), \
             mock.patch.object(migration, "send") as send:
            result = migration.migrate_board(self.board, self.migrator, self.options)
        self.assertEqual(result, "paged")
        calls = [call.args for call in send.call_args_list]
        imports = [x[2:] for x in calls if x[1] == "importMarkees(address,uint256,uint256)"]
        offset = 0
        for board, start, size in imports:
            self.assertEqual(board, self.board)
            self.assertEqual(start, offset)
            self.assertLessEqual(size, 10)
            offset += size
        self.assertEqual(offset, 21)
        self.assertEqual(calls[-1][1:3], ("finishMigration(address)", self.board))

    def test_dry_run_does_not_send_or_prematurely_estimate_finish(self):
        self.options.execute = False
        reads = iter([1, 2])
        with mock.patch.object(migration, "read", side_effect=lambda *a, **k: next(reads)), \
             mock.patch.object(migration, "checked_estimate", return_value=100_000) as estimate, \
             mock.patch.object(migration, "send") as send:
            self.assertEqual(migration.migrate_board(self.board, self.migrator, self.options), "paged-plan")
        self.assertTrue(all(c.args[1] != "finishMigration(address)" for c in estimate.call_args_list))
        send.assert_not_called()

    def test_streaming_restart_skips_successor_clones(self):
        old = "0x" + "4" * 40
        forwarder = "0x" + "5" * 40
        prefix = "0x363d3d373d3d3d363d73"
        suffix = "5af43d82803e903d91602b57fd5bf3"
        codes = {self.board: prefix + old[2:] + suffix,
                 self.migrator: prefix + forwarder[2:] + suffix}
        with mock.patch.object(migration, "cast", side_effect=lambda _, board, **kwargs: codes[board]), \
             mock.patch.object(migration, "read", side_effect=lambda *args, **kwargs: args[2].lower() == old):
            legacy = migration.streaming_legacy_boards(
                [self.board, self.migrator], "0x" + "6" * 40, forwarder, "unused")
        self.assertEqual(legacy, [self.board])


class RolloutArtifactTests(unittest.TestCase):
    def test_unconfirmed_broadcast_is_rejected(self):
        artifact = {"chain": 8453, "pending": [], "transactions": [{}], "receipts": []}
        with self.assertRaisesRegex(ValueError, "confirmed receipt"):
            rollout.parse_broadcast(artifact)

    def test_failed_receipt_is_rejected(self):
        artifact = {"chain": 8453, "pending": [], "transactions": [{"hash": "0x1"}],
                    "receipts": [{"transactionHash": "0x1", "status": "0x0"}]}
        with self.assertRaisesRegex(ValueError, "failed"):
            rollout.parse_broadcast(artifact)


if __name__ == "__main__":
    unittest.main()
