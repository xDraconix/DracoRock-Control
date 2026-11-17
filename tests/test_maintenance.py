"""Regression checks for scheduled backup admission and durable job selection."""
import importlib.machinery
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "system/usr-local-sbin/dracorock-backup-manager"
loader = importlib.machinery.SourceFileLoader("maintenance_engine", str(SCRIPT))
spec = importlib.util.spec_from_loader(loader.name, loader)
engine = importlib.util.module_from_spec(spec)
loader.exec_module(engine)


class MaintenanceTests(unittest.TestCase):
    def schedule(self, responses, terminal="success"):
        clock = [0]
        records = []
        def advance(seconds):
            clock[0] += seconds
        with tempfile.TemporaryDirectory() as tmp:
            with (patch.object(engine, "MAINTENANCE", Path(tmp)),
                    patch.object(engine, "command", side_effect=responses) as command,
                    patch.object(engine, "write_schedule", side_effect=lambda *args, **kwargs: records.append(args)),
                    patch.object(engine, "read_record", return_value={"state": terminal, "message": terminal}),
                    patch.object(engine.time, "monotonic", side_effect=lambda: clock[0]),
                    patch.object(engine.time, "sleep", side_effect=advance)):
                engine.scheduled_backup()
        return command, records

    def result(self, output, code=0):
        return subprocess.CompletedProcess([], code, output, "")

    def test_busy_query_then_one_admitted_backup(self):
        command, records = self.schedule([
            self.result('{"error":"busy"}', 1),
            self.result('{"ok":true,"count":0}'),
            self.result("JOB_ID=" + "a" * 32),
        ])
        self.assertEqual(command.call_count, 3)
        self.assertEqual([record[0] for record in records], ["waiting", "running", "success"])

    def test_players_online_until_window_expires(self):
        clock = [0]
        with tempfile.TemporaryDirectory() as tmp:
            with (patch.object(engine, "MAINTENANCE", Path(tmp)),
                    patch.object(engine, "command", return_value=self.result('{"ok":true,"count":2}')) as command,
                    patch.object(engine, "write_schedule") as record,
                    patch.object(engine.time, "monotonic", side_effect=lambda: clock[0]),
                    patch.object(engine.time, "sleep", side_effect=lambda seconds: clock.__setitem__(0, clock[0] + seconds))):
                engine.scheduled_backup()
                self.assertEqual(command.call_count, 24)
                self.assertEqual(record.call_args.args[0], "skipped")

    def test_busy_admission_retries(self):
        command, records = self.schedule([
            self.result('{"ok":true,"count":0}'), self.result("busy", 1),
            self.result('{"ok":true,"count":0}'), self.result("JOB_ID=" + "b" * 32),
        ])
        self.assertEqual(command.call_count, 4)
        self.assertEqual(records[-1][0], "success")

    def test_failed_worker_is_not_queued_again(self):
        command, records = self.schedule([
            self.result('{"ok":true,"count":0}'), self.result("JOB_ID=" + "c" * 32),
        ], terminal="failed")
        self.assertEqual(command.call_count, 2)
        self.assertEqual(records[-1][0], "failed")

    def test_unfinished_worker_is_not_queued_again(self):
        command, records = self.schedule([
            self.result('{"ok":true,"count":0}'), self.result("JOB_ID=" + "d" * 32),
        ], terminal="running")
        self.assertEqual(command.call_count, 2)
        self.assertEqual(records[-1][0], "failed")

    def test_history_ignores_unrelated_and_invalid_records(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            for index, action in enumerate(("backup", "world-export")):
                identity = str(index) * 32
                (directory / (identity + ".json")).write_text(json.dumps({
                    "id": identity, "action": action, "state": "success", "updated_at": index
                }))
            (directory / "invalid.json").write_text("{")
            with patch.object(engine, "JOBS", directory), patch.object(engine, "RUNTIME_JOBS", directory):
                records = engine.history()
            self.assertEqual([item["action"] for item in records], ["backup"])

    def test_delete_removes_only_selected_archive_and_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            selected = root / "minecraft-test.tar.gz"
            selected.write_bytes(b"disposable fixture")
            selected.with_name(selected.name + ".json").write_text("{}")
            other = root / "minecraft-keep.tar.gz"
            other.write_bytes(b"keep")
            with patch.object(engine, "BACKUPS", root), patch.object(engine, "check_backup_dir"):
                records = engine.list_backups()["server"]
                identity = next(item["id"] for item in records if item["name"] == selected.name)
                self.assertTrue(engine.delete_backup(identity)["ok"])
                self.assertFalse(selected.exists())
                self.assertFalse(selected.with_name(selected.name + ".json").exists())
                self.assertEqual(other.read_bytes(), b"keep")
                with self.assertRaises(engine.BackupError):
                    engine.delete_backup(identity)
                with self.assertRaises(engine.BackupError):
                    engine.delete_backup("../../etc/passwd")

    def test_update_worker_persists_failure_and_run_identity(self):
        import os
        worker = (SCRIPT.parent / "bedrock-panel-update-worker").read_text()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            runtime = root / "runtime"
            runtime.mkdir()
            update = root / "update.sh"
            update.write_text("exit 42\n")
            acl = root / "acl.sh"
            acl.write_text("#!/bin/bash\nexit 0\n")
            acl.chmod(0o755)
            worker = worker.replace("/run/bedrock-panel-jobs", str(runtime))
            worker = worker.replace("/var/lib/bedrock-control-pro/jobs", str(root / "history"))
            worker = worker.replace("/root/update-mc2.sh", str(update))
            worker = worker.replace("/usr/local/sbin/bedrock-config-access", str(acl))
            path = root / "worker.sh"
            path.write_text(worker)
            identity = "f" * 32
            result = subprocess.run(["bash", str(path), "update", identity],
                                    capture_output=True, text=True,
                                    env={**os.environ, "INVOCATION_ID": "e" * 32})
            record = json.loads((root / "history" / (identity + ".json")).read_text())
            self.assertEqual(result.returncode, 42, result.stderr)
            self.assertEqual(record["state"], "failed")
            self.assertEqual(record["exit_status"], 42)
            self.assertEqual(record["invocation"], "e" * 32)
            self.assertGreaterEqual(record["updated_at"], record["started_at"])


if __name__ == "__main__":
    unittest.main()
