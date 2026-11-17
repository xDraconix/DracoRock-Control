"""World restore and timer transaction regression tests on isolated fixtures."""
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from zipfile import ZipFile, ZipInfo

SCRIPT = Path(__file__).resolve().parents[1] / "system/usr-local-sbin/dracorock-backup-manager"
loader = importlib.machinery.SourceFileLoader("restore_engine", str(SCRIPT))
spec = importlib.util.spec_from_loader(loader.name, loader)
engine = importlib.util.module_from_spec(spec)
loader.exec_module(engine)


class RestoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.server = self.root / "minecraft_bedrock"
        self.target = self.server / "worlds" / "Current"
        self.target.mkdir(parents=True)
        (self.target / "level.dat").write_bytes(b"old-level")
        (self.target / "db").mkdir()
        (self.target / "db/chunk").write_bytes(b"old-chunk")
        self.backups = self.root / "backups"
        (self.backups / "worlds").mkdir(parents=True)
        self.lock = self.root / "backup.lock"
        for name, value in (("SERVER", self.server), ("BACKUPS", self.backups), ("LOCK", self.lock)):
            guard = patch.object(engine, name, value)
            guard.start()
            self.addCleanup(guard.stop)
        for guard in (patch.object(engine, "offline"), patch.object(engine, "check_backup_dir"),
                      patch.object(engine.pwd, "getpwnam", return_value=SimpleNamespace(pw_uid=os.getuid(), pw_gid=os.getgid()))):
            guard.start()
            self.addCleanup(guard.stop)

    def fixture(self):
        source = self.root / "Saved"
        (source / "db").mkdir(parents=True)
        (source / "level.dat").write_bytes(b"restored-level")
        (source / "db/chunk").write_bytes(b"restored-chunk")
        path = self.backups / "worlds" / "fixture.tar.gz"
        with tarfile.open(path, "w:gz") as archive:
            archive.add(source, arcname="Saved")
        return engine.list_backups()["worlds"][0]["id"]

    def test_preview_and_restore_with_verified_safety_copy(self):
        identity = self.fixture()
        preview = engine.restore_preview({"id": identity})
        self.assertEqual(preview["targets"], ["Current"])
        self.assertEqual((self.target / "level.dat").read_bytes(), b"old-level")
        result = engine.restore_world({"id": identity, "target": "Current"})
        self.assertEqual((self.target / "level.dat").read_bytes(), b"restored-level")
        self.assertEqual((self.target / "db/chunk").read_bytes(), b"restored-chunk")
        safety = next(self.backups.rglob(result["safety_backup"]))
        with ZipFile(safety) as archive:
            self.assertEqual(archive.read("level.dat"), b"old-level")
            self.assertEqual(archive.read("db/chunk"), b"old-chunk")

    def test_restore_rejects_running_server_before_modifying_target(self):
        identity = self.fixture()
        with patch.object(engine, "offline", side_effect=engine.BackupError("running")):
            with self.assertRaises(engine.BackupError):
                engine.restore_world({"id": identity, "target": "Current"})
        self.assertEqual((self.target / "level.dat").read_bytes(), b"old-level")

    def test_invalid_paths_and_links_rejected(self):
        for filename, mode in (("../outside", 0), ("/absolute", 0), ("link", 0o120777 << 16)):
            with tempfile.TemporaryFile() as stream:
                with ZipFile(stream, "w") as archive:
                    archive.writestr("level.dat", b"level")
                    archive.writestr("db/chunk", b"data")
                    info = ZipInfo(filename)
                    info.external_attr = mode
                    archive.writestr(info, b"bad")
                stream.seek(0)
                with ZipFile(stream) as archive:
                    with self.assertRaises(engine.BackupError):
                        engine.inspect_world_archive(archive)

    def test_invalid_target_rejected(self):
        identity = self.fixture()
        for target in ("../Current", "/Current", "Current/db", "."):
            with self.assertRaises(engine.BackupError):
                engine.restore_world({"id": identity, "target": target})


class ScheduleTests(unittest.TestCase):
    def config(self):
        return {"enabled": True, "time": "05:15", "days": [0, 2, 6], "retry_minutes": 30}

    def test_strict_validation(self):
        for field, value in (("time", "12:00\nExecStart=bad"), ("days", [7]), ("days", [True]),
                             ("days", []), ("retry_minutes", 121), ("enabled", "yes")):
            with self.assertRaises(engine.BackupError):
                engine.validate_schedule({**self.config(), field: value})

    def test_save_and_rollback(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with (patch.object(engine, "SCHEDULE_CONFIG", root / "settings.json"),
                  patch.object(engine, "TIMER_OVERRIDE", root / "timer/schedule.conf"),
                  patch.object(engine, "MAINTENANCE", root / "state")):
                with patch.object(engine, "command", return_value=subprocess.CompletedProcess([], 0, "", "")):
                    engine.save_schedule(self.config())
                old_config = engine.SCHEDULE_CONFIG.read_bytes()
                old_override = engine.TIMER_OVERRIDE.read_bytes()
                self.assertIn("Mon,Wed,Sun *-*-* 05:15:00 Europe/Berlin", old_override.decode())
                def fail_restart(*args):
                    return subprocess.CompletedProcess(args, 1 if "restart" in args else 0, "", "")
                with patch.object(engine, "command", side_effect=fail_restart):
                    with self.assertRaises(engine.BackupError):
                        engine.save_schedule({**self.config(), "time": "08:30"})
                self.assertEqual(engine.SCHEDULE_CONFIG.read_bytes(), old_config)
                self.assertEqual(engine.TIMER_OVERRIDE.read_bytes(), old_override)

    def test_zero_retry_window_attempts_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            with (patch.object(engine, "MAINTENANCE", Path(tmp)),
                  patch.object(engine, "schedule_config", return_value={**self.config(), "retry_minutes": 0}),
                  patch.object(engine, "command", return_value=subprocess.CompletedProcess([], 0, '{"ok":true,"count":2}', "")) as command,
                  patch.object(engine, "write_schedule") as record):
                engine.scheduled_backup()
                self.assertEqual(command.call_count, 1)
                self.assertEqual(record.call_args.args[0], "skipped")


if __name__ == "__main__":
    unittest.main()
