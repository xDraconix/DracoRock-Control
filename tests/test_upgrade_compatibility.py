"""Check the candidate using immutable 3.5.0 planner/validator code.

No installed helpers or system files are changed. Only machine-specific PHP
discovery and the installed planner's ownership are simulated. Pass a release
ZIP to check exactly the packaged files rather than the source directory.
"""
import hashlib
import importlib.machinery
import json
import os
import pathlib
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIXTURES = ROOT/'tests/fixtures/updater-v3.5.0'
BLOBS = {
    'bedrock-panel-system-plan': 'c2992d764dca35306a56800e91ce892f66642ede',
    'bedrock-panel-apply-release': '0c375460bf91cd2fd864921fab8972c6778d443c',
}
for name, expected in BLOBS.items():
    data = (FIXTURES/name).read_bytes()
    assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest() == expected, name
planner = importlib.machinery.SourceFileLoader('legacy_plan', str(FIXTURES/'bedrock-panel-system-plan')).load_module()
updater = importlib.machinery.SourceFileLoader('legacy_apply', str(FIXTURES/'bedrock-panel-apply-release')).load_module()
updater.SYSTEM_PLAN = FIXTURES/'bedrock-panel-system-plan'
real_run = subprocess.run
real_is_dir = pathlib.Path.is_dir
real_stat = pathlib.Path.stat
php_dir = pathlib.Path('/etc/php/8.3/apache2/conf.d')

def is_dir(path):
    return True if path == php_dir else real_is_dir(path)

def installed_stat(path, *args, **kwargs):
    result = real_stat(path, *args, **kwargs)
    if path == updater.SYSTEM_PLAN:
        values = list(result)
        values[0] = stat.S_IFREG | 0o755
        values[4] = 0  # The installed trusted planner is root-owned.
        return os.stat_result(values)
    return result

def run(args, **kwargs):
    if str(args[0]) == str(updater.SYSTEM_PLAN):
        try:
            value = planner.plan(args[2])
            return subprocess.CompletedProcess(args, 0, json.dumps(value), '')
        except ValueError as exc:
            return subprocess.CompletedProcess(args, 1, '', str(exc))
    if str(args[0]) == '/usr/bin/php':
        return subprocess.CompletedProcess(args, 0, '8.3', '')
    return real_run(args, **kwargs)

with tempfile.TemporaryDirectory() as tmp:
    root = pathlib.Path(tmp)
    if len(sys.argv) == 2:
        with zipfile.ZipFile(sys.argv[1]) as archive:
            archive.extractall(root/'unpacked')
        candidates = list((root/'unpacked').glob('*/VERSION'))
        assert len(candidates) == 1, 'Expected exactly one installer in release ZIP'
        source = candidates[0].parent
    else:
        assert len(sys.argv) == 1
        source = ROOT
    with patch('subprocess.run', side_effect=run), \
         patch.object(pathlib.Path, 'is_dir', is_dir), \
         patch.object(pathlib.Path, 'stat', installed_stat):
        entries = updater.validated_system_plan(source)
        assert any(e['source'] == 'system/usr-local-sbin/bedrock-nethernet-check' for e in entries)
        assert not any('/home/mcserver/' in e['target'] for e in entries)
        assert not (source/'system/usr-local-sbin/bedrock-wait-port').exists()
        # Prove this gate would have caught the 3.5.1 packaging regression.
        broken = root/'broken'
        shutil.copytree(source/'system', broken/'system')
        (broken/'system/usr-local-sbin/bedrock-wait-port').write_text('#!/usr/bin/env python3\n')
        try:
            updater.validated_system_plan(broken)
        except updater.UpgradeError as exc:
            assert 'Nicht erlaubter' in str(exc), exc
        else:
            raise AssertionError('Legacy updater accepted an unknown helper')
print('PASS: unmodified v3.5.0 planner and validator accept candidate; v3.5.1 regression rejected')
