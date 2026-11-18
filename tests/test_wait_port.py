"""Isolated bind-probe tests: no live Minecraft ports or config are touched."""
import errno
import pathlib
import runpy
import socket
from unittest.mock import MagicMock, patch

SCRIPT = pathlib.Path(__file__).resolve().parents[1]/'system/usr-local-sbin/bedrock-wait-port'

def run(errors, times):
    probe = MagicMock()
    probe.__enter__.return_value = probe
    probe.bind.side_effect = errors
    with patch('pathlib.Path.read_text', return_value='server-port=24567\n'), \
         patch('socket.socket', return_value=probe), \
         patch('time.monotonic', side_effect=times), \
         patch('time.sleep') as sleep:
        runpy.run_path(str(SCRIPT), run_name='__main__')
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
