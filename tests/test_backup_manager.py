"""Isolated regression tests for the v3.2 offline backup engine."""
import importlib.machinery
import importlib.util
import io
import json
import os
from types import SimpleNamespace
from pathlib import Path
import tempfile
import tarfile
import unittest
from datetime import datetime, timedelta
from zipfile import ZipFile
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "system/usr-local-sbin/dracorock-backup-manager"
loader = importlib.machinery.SourceFileLoader("dracorock_backup", str(SCRIPT))
spec = importlib.util.spec_from_loader(loader.name, loader)
engine = importlib.util.module_from_spec(spec)
loader.exec_module(engine)


class BackupEngineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.server = self.base / "minecraft_bedrock"
        self.server.mkdir()
        (self.server / "server.properties").write_text("level-name=Test\n")
        (self.server / "worlds").mkdir()
        (self.server / "worlds" / "level.dat").write_bytes(b"world data")
        self.backups = self.base / "backups"
        self.backups.mkdir()
        self.patch_server = patch.object(engine, "SERVER", self.server)
        self.patch_backups = patch.object(engine, "BACKUPS", self.backups)
        self.patch_offline = patch.object(engine, "offline", return_value=None)
        self.patch_dir = patch.object(engine, "check_backup_dir", return_value=None)
        for item in (self.patch_server, self.patch_backups, self.patch_offline, self.patch_dir):
            item.start()
            self.addCleanup(item.stop)

    def test_existing_mcserver_owned_backup_directory(self):
        self.patch_dir.stop()
        try:
            self.backups.chmod(0o750)
            with patch.object(engine.pwd, "getpwnam", return_value=SimpleNamespace(pw_uid=os.getuid())):
                engine.check_backup_dir()
                self.backups.chmod(0o770)
                with self.assertRaises(engine.BackupError):
                    engine.check_backup_dir()
        finally:
            self.patch_dir.start()

    def test_preflight_without_service_changes(self):
        files, total = engine.check_source()
        self.assertEqual(files, 2)
        self.assertGreater(total, 0)

    def test_archive_name_validation(self):
        result = engine.create()
        self.assertTrue(engine.NAME_RE.fullmatch(result["archive"]))
        self.assertFalse(engine.NAME_RE.fullmatch(result["archive"] + ".json"))

    def test_backup_worker_preflights_and_restarts(self):
        worker = (Path(__file__).resolve().parents[1] /
                  "system/usr-local-sbin/bedrock-panel-update-worker").read_text()
        self.assertIn('"$ENGINE" preflight', worker)
        self.assertNotIn('install -d -m 0750 -o root -g root "$BACKUPS"', worker)
        self.assertIn('[[ -d "$BACKUPS" && ! -L "$BACKUPS" ]]', worker)
        self.assertIn("trap 'restart_minecraft", worker)
        self.assertLess(worker.index('"$ENGINE" preflight'),
                        worker.index('/usr/bin/systemctl stop "$SERVICE"'))
        self.assertIn('"$ENGINE" create', worker)

    def test_create_and_verify(self):
        result = engine.create()
        self.assertEqual(result["files"], 2)
        self.assertEqual(result["sha256"], engine.digest(self.backups / result["archive"]))
        self.assertEqual(engine.verify(result["archive"])["ok"], True)
        self.assertEqual(json.loads((self.backups / (result["archive"] + ".json")).read_text())["sha256"], result["sha256"])

    def test_retention_uses_calendar_buckets_and_keeps_latest_per_bucket(self):
        start = datetime(2026, 11, 15, 4, tzinfo=engine.ZONE)
        snapshots = [(index, start - timedelta(days=index)) for index in range(400)]
        snapshots.append(("older-today", start - timedelta(hours=2)))
        keep = engine.retained(snapshots)
        self.assertTrue(set(range(7)).issubset(keep))
        self.assertNotIn("older-today", keep)
        self.assertLessEqual(len(keep), 23)
        self.assertEqual(len({(snapshots[i][1].year, snapshots[i][1].month) for i in keep}), 12)
        self.assertTrue(all(index in keep for index in (7, 14, 21)))

    def test_managed_backup_includes_separate_world_zip(self):
        world = self.server / "worlds" / "world-folder"
        world.mkdir(parents=True)
        (world / "level.dat").write_bytes(b"level")
        (world / "levelname.txt").write_text("Beispiel Welt", encoding="utf-8")
        legacy = self.backups / "legacy.tar.gz"
        legacy.write_bytes(b"legacy")
        result = engine.create_set()
        archive = Path(result["worlds"][0])
        self.assertTrue(archive.name.startswith("Beispiel Welt-"))
        self.assertEqual(archive.suffix, ".zip")
        with ZipFile(archive) as data:
            self.assertEqual(data.read("level.dat"), b"level")
            self.assertIsNone(data.testzip())
        self.assertTrue(engine.verify(result["server"]["archive"])["ok"])
        self.assertTrue(legacy.is_file())
        listed = engine.list_backups()
        self.assertEqual([entry["name"] for entry in listed["worlds"]], [archive.name])
        self.assertIn(result["server"]["archive"], [entry["name"] for entry in listed["server"]])

    def test_tar_zip_export_preserves_server_tree_and_rejects_traversal(self):
        def tar_with(name):
            source = io.BytesIO()
            with tarfile.open(fileobj=source, mode="w:gz") as archive:
                entry = tarfile.TarInfo(name)
                entry.size = 4
                archive.addfile(entry, io.BytesIO(b"test"))
            source.seek(0)
            return source

        name = self.server.name + "/server.properties"
        target = io.BytesIO()
        engine.archive_to_zip(tar_with(name), target, "server", 4096)
        with ZipFile(target) as archive:
            self.assertEqual(archive.read(name), b"test")
        with self.assertRaises(engine.BackupError):
            engine.archive_to_zip(tar_with(self.server.name + "/../unsafe"), io.BytesIO(), "server", 4096)

    def test_corruption_detected(self):
        result = engine.create()
        with (self.backups / result["archive"]).open("ab") as stream:
            stream.write(b"tampered")
        with self.assertRaises(engine.BackupError):
            engine.verify(result["archive"])

    def test_missing_manifest_rejected(self):
        result = engine.create()
        (self.backups / (result["archive"] + ".json")).unlink()
        with self.assertRaises(engine.BackupError):
            engine.verify(result["archive"])

    def test_path_traversal_rejected(self):
        with self.assertRaises(engine.BackupError):
            engine.verify("../unsafe.tar.gz")

    def test_source_symlink_rejected(self):
        (self.server / "worlds" / "external").symlink_to(self.base)
        with self.assertRaises(engine.BackupError):
            engine.check_source()

    def test_source_hardlink_rejected(self):
        (self.server / "worlds" / "copy.dat").hardlink_to(self.server / "worlds" / "level.dat")
        with self.assertRaises(engine.BackupError):
            engine.check_source()

    def test_no_final_archive_when_validation_fails(self):
        with patch.object(engine, "validate_archive", side_effect=engine.BackupError("bad tar")):
            with self.assertRaises(engine.BackupError):
                engine.create()
        self.assertEqual(list(self.backups.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
