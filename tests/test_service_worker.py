import json, os, pathlib, subprocess, tempfile

source = (pathlib.Path(__file__).resolve().parents[1]/'system/usr-local-sbin/bedrock-panel-service-worker').read_text()
cases = {
    'retry': ('restart', ['active', 'deactivating', 'activating', 'failed', 'activating', 'active'], 0),
    'failure': ('start', ['failed'], 1),
    'stop': ('stop', ['deactivating', 'inactive'], 0),
    'forced-stop': ('stop', ['deactivating', 'failed'], 0),
}
for name, (action, states, expected) in cases.items():
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        (root/'jobs').mkdir()
        (root/'states').write_text(json.dumps(states))
        mock = root/'systemctl'
        mock.write_text('''#!/usr/bin/python3
import json, pathlib, sys
r = pathlib.Path(__file__).parent
states = json.loads((r/'states').read_text())
args = sys.argv[1:]
idx = int((r/'index').read_text()) if (r/'index').exists() else -1
if args[0] == 'show':
    prop = args[args.index('-p')+1]
    if prop == 'ActiveState':
        idx += 1
        (r/'index').write_text(str(idx))
    state = states[min(max(idx, 0), len(states)-1)]
    print({'ActiveState': state, 'SubState': 'running' if state == 'active' else state,
           'InvocationID': 'old' if idx <= 0 else 'new', 'MainPID': '0', 'Result': 'success'}[prop])
elif args[0] == 'status':
    sys.exit(1)
''')
        mock.chmod(0o755)
        worker = source.replace('export PATH=/usr/sbin:/usr/bin:/sbin:/bin', f'export PATH={tmp}:/usr/sbin:/usr/bin:/sbin:/bin')
        worker = worker.replace('/run/bedrock-panel-jobs', tmp+'/jobs').replace('/var/lib/bedrock-control-pro/jobs', tmp+'/history')
        worker = worker.replace('sleep 2', 'sleep 0.1').replace('terminal_since >= 10', 'terminal_since >= 1')
        path = root/'worker'
        path.write_text(worker)
        result = subprocess.run(['bash', str(path), action, 'a'*32], capture_output=True, text=True, timeout=10)
        status = json.loads((root/'jobs'/('a'*32+'.json')).read_text())
        assert result.returncode == expected, (name, result.stderr, status)
        assert status['state'] == ('success' if expected == 0 else 'failed'), (name, status)
        if name == 'retry':
            assert int((root/'index').read_text()) == 5, 'Reported success for the old invocation or stopped before retry'
        print(name, 'PASS')
