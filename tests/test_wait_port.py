"""Isolated bind-probe tests: no live Minecraft ports or config are touched."""
import errno
import pathlib
import subprocess
import tempfile
import socket
from unittest.mock import MagicMock, patch

SCRIPT = pathlib.Path(__file__).resolve().parents[1]/'system/usr-local-sbin/bedrock-nethernet-check'
SOURCE = SCRIPT.read_text()
PROBE = SOURCE.split("<<'PY_WAIT_PORT'\n", 1)[1].split('\nPY_WAIT_PORT', 1)[0]

def run(errors, times):
    probe = MagicMock()
    probe.__enter__.return_value = probe
    probe.bind.side_effect = errors
    with patch('sys.argv', ['-', '24567']), \
         patch('socket.socket', return_value=probe), \
         patch('time.monotonic', side_effect=times), \
         patch('time.sleep') as sleep:
        exec(compile(PROBE, str(SCRIPT), 'exec'), {})
    probe.bind.assert_called_with(('::', 24567))
    assert all(call.args[1] != socket.SO_REUSEADDR for call in probe.setsockopt.call_args_list)
    return probe, sleep

run([None], [0])
probe, sleep = run([OSError(errno.EADDRINUSE, 'TIME_WAIT'), None], [0, 1])
assert probe.bind.call_count == 2
sleep.assert_called_once_with(1)
try:
    run([OSError(errno.EADDRINUSE, 'busy')], [0, 75])
except SystemExit as exc:
    assert 'weiterhin belegt' in str(exc)
else:
    raise AssertionError('Occupied port did not time out')
try:
    run([OSError(errno.EACCES, 'denied')], [0])
except OSError as exc:
    assert exc.errno == errno.EACCES
else:
    raise AssertionError('Unexpected socket error swallowed')
print('PASS: free port, TIME_WAIT retry, bounded timeout, unexpected error')

# Exercise the real shell dispatcher and existing no-argument readiness path.
with tempfile.TemporaryDirectory() as tmp:
    root = pathlib.Path(tmp)
    props = root/'server.properties'
    props.write_text('server-port=0\n')
    helper = root/'check'
    helper.write_text(SOURCE.replace('/home/mcserver/minecraft_bedrock/server.properties', str(props)))
    assert subprocess.run(['bash', str(helper), '--wait-port'], capture_output=True).returncode == 1
    assert subprocess.run(['bash', str(helper), '--unknown'], capture_output=True).returncode == 2
    with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as s:
        s.bind(('::', 0))
        free_port = s.getsockname()[1]
    props.write_text(f'server-port={free_port}\n')
    result = subprocess.run(['bash', str(helper), '--wait-port'], capture_output=True, text=True, timeout=5)
    assert result.returncode == 0, result.stderr
    assert f'TCP-Port {free_port}' in result.stdout
    curl = root/'curl'
    curl.write_text('#!/bin/sh\nprintf 200\n')
    curl.chmod(0o755)
    helper.write_text(helper.read_text().replace('/usr/bin/curl', str(curl)).replace('/usr/bin/sleep 1', ':'))
    result = subprocess.run(['bash', str(helper)], capture_output=True, text=True, timeout=5)
    assert result.returncode == 0 and 'HTTP 200' in result.stdout, result
print('PASS: shell mode dispatch, invalid port/argument, original HTTP readiness')
