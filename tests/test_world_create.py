"""World creation writes exact optional seeds without touching world data."""
import contextlib
import importlib.machinery
import io
import json
import pathlib
import subprocess
import tempfile
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
world = importlib.machinery.SourceFileLoader('world_create', str(ROOT/'system/usr-local-sbin/bedrock-world-manager')).load_module()

with tempfile.TemporaryDirectory() as tmp:
    world.BASE = pathlib.Path(tmp)
    world.WORLDS = world.BASE/'worlds'
    world.WORLDS.mkdir()
    world.PROPS = world.BASE/'server.properties'
    original = '# Preserve comments\nlevel-name=Old\nlevel-seed=old-seed\ndifficulty=easy\n'
    with patch.object(world, 'is_running', return_value=False), \
         patch.object(world.os, 'chown'), \
         patch.object(world.subprocess, 'run') as commands:
        for seed in ('', '0', '-42', '9223372036854775807', '-9223372036854775808', 'My island', 'Wüste', 'abc=def'):
            world.PROPS.write_text(original)
            with contextlib.redirect_stdout(io.StringIO()) as output:
                world.create('New world', seed)
            assert json.loads(output.getvalue())['ok']
            assert world.PROPS.read_text() == original.replace('level-name=Old', 'level-name=New world').replace('level-seed=old-seed', 'level-seed='+seed)
            assert not list(world.WORLDS.iterdir()), 'Creation must be left to Bedrock'
        world.PROPS.write_text(original)
        with contextlib.redirect_stdout(io.StringIO()):
            world.create('Legacy caller')
        assert 'level-seed=\n' in world.PROPS.read_text(), 'Omitted seed must clear the previous seed'
        world.PROPS.write_text('level-name=Old\ndifficulty=easy')
        with contextlib.redirect_stdout(io.StringIO()):
            world.create('New', '123')
        assert world.PROPS.read_text() == 'level-name=New\ndifficulty=easy\nlevel-seed=123\n'
        for invalid in ('bad\nlevel-name=Injected', 'bad\rseed', 'bad\x00', 'bad\u2028seed', 'x'*129, 123, None):
            world.PROPS.write_text(original)
            with contextlib.redirect_stdout(io.StringIO()):
                try:
                    world.create('New', invalid)
                except SystemExit:
                    pass
                else:
                    raise AssertionError(('Accepted invalid seed', invalid))
            assert world.PROPS.read_text() == original
        existing = world.WORLDS/'Existing'
        existing.mkdir()
        (existing/'level.dat').write_bytes(b'untouched-world')
        world.PROPS.write_text(original)
        with contextlib.redirect_stdout(io.StringIO()):
            try:
                world.create('Existing', '999')
            except SystemExit:
                pass
            else:
                raise AssertionError('Existing world overwritten')
            world.select('Existing')
        assert 'level-seed=old-seed\n' in world.PROPS.read_text(), 'Selecting a world must not change its seed setting'
        assert (existing/'level.dat').read_bytes() == b'untouched-world'
        assert all(call.args[0][0] == '/usr/bin/setfacl' for call in commands.call_args_list), 'No service start/stop allowed'

# Run the real PHP route with only its HTTP input and privileged runner replaced.
page = (ROOT/'app/public/index.php').read_text()
route = page.split(" if($api==='world-action') {", 1)[1].split(" if($api==='world-duplicate')", 1)[0]
route = "if($api==='world-action') {"+route
route = route.replace("file_get_contents('php://input')", '$argv[1]')
harness = '''$api='world-action';
$_SERVER=['REQUEST_METHOD'=>'POST','HTTP_X_CSRF_TOKEN'=>'test'];
function csrf(){return 'test';}
function respond($data,$status=200){echo json_encode(['status'=>$status,'data'=>$data]);exit;}
function run($args){return ['out'=>json_encode(['args'=>$args]),'err'=>'','code'=>0];}
'''+route
for seed in ('', '0', '-9223372036854775808', 'My island'):
    result = subprocess.run(['php', '-r', harness, json.dumps({'action':'create','name':'New','seed':seed})], capture_output=True, text=True, check=True)
    answer = json.loads(result.stdout)
    assert answer['status'] == 200 and answer['data']['args'][-1] == seed, answer
for seed in (123, None, [], 'x'*513):
    result = subprocess.run(['php', '-r', harness, json.dumps({'action':'create','name':'New','seed':seed})], capture_output=True, text=True, check=True)
    assert json.loads(result.stdout)['status'] == 400
result = subprocess.run(['php', '-r', harness, json.dumps({'action':'create','name':'New'})], capture_output=True, text=True, check=True)
assert json.loads(result.stdout)['data']['args'][-1] == ''
print('PASS: optional world seeds, exact strings, random reset, protected worlds, PHP API validation')

setup = (ROOT/'system/usr-local-sbin/bedrock-setup-worker').read_text()
validate = setup.split("<<'PYVALID'\n",1)[1].split('\nPYVALID',1)[0]
properties = setup.split("<<'PYPROPS'\n",1)[1].split('\nPYPROPS',1)[0]
base = dict(server_name='Test', world_name='World', gamemode='survival', difficulty='easy', port=19132, max_players=10)
setup_route = "if($api==='setup-install') {"+page.split(" if($api==='setup-install') {",1)[1].split(" if($api==='properties-read')",1)[0]
setup_harness = '''$api='setup-install';
$_SERVER=['REQUEST_METHOD'=>'POST','HTTP_X_CSRF_TOKEN'=>'test'];
function csrf(){return 'test';}
function respond($data,$status=200){echo json_encode(['status'=>$status,'data'=>$data]);exit;}
function run($args){respond(['config'=>json_decode(base64_decode(end($args)),true)]);}
'''+setup_route.replace("file_get_contents('php://input')", '$argv[1]')
with tempfile.TemporaryDirectory() as tmp:
    config = pathlib.Path(tmp)/'config.json'
    props = pathlib.Path(tmp)/'server.properties'
    for seed in (None, '', '0', '-9223372036854775808', 'My island'):
        data = dict(base)
        if seed is not None:
            data['world_seed'] = seed
        config.write_text(json.dumps(data))
        subprocess.run(['python3','-c',validate,str(config)], check=True)
        props.write_text('level-name=Old\nlevel-seed=stale\n')
        subprocess.run(['python3','-c',properties,str(config),str(props)], check=True)
        assert 'level-seed='+(seed or '')+'\n' in props.read_text()
        answer = subprocess.run(['php','-r',setup_harness,json.dumps(data)], capture_output=True, text=True, check=True)
        assert json.loads(answer.stdout)['data']['config'] == data
    for seed in (None, 123, 'bad\nlevel-name=Injected', 'x'*129):
        config.write_text(json.dumps(dict(base,world_seed=seed)))
        result = subprocess.run(['python3','-c',validate,str(config)], capture_output=True)
        assert result.returncode != 0, seed
print('PASS: standalone setup preserves optional seeds and rejects invalid input before installation')
