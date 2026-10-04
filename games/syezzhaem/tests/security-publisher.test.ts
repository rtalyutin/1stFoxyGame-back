import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('SEC-06 immutable publisher rejects zip traversal, duplicate names and symlink entries before writing',()=>{
  const script=String.raw`
import importlib.util, pathlib, stat, tempfile, warnings, zipfile
spec=importlib.util.spec_from_file_location('syezzhaem_publisher','scripts/publish.py')
publisher=importlib.util.module_from_spec(spec);spec.loader.exec_module(publisher)
with tempfile.TemporaryDirectory(prefix='syezzhaem-security-zip-') as temp:
    root=pathlib.Path(temp)
    for index,name in enumerate(('../escape','/absolute','assets/../escape',r'assets\escape')):
        archive=root/('invalid-'+str(index)+'.zip');stage=root/('stage-'+str(index));stage.mkdir()
        with zipfile.ZipFile(archive,'w') as z:z.writestr(name,b'synthetic')
        try:publisher.extract(archive,stage)
        except ValueError:pass
        else:raise AssertionError('Unsafe path accepted: '+name)
        assert not any(stage.iterdir()),'Validation must precede writes'
    archive=root/'duplicate.zip';stage=root/'duplicates';stage.mkdir()
    with warnings.catch_warnings():
        warnings.simplefilter('ignore',UserWarning)
        with zipfile.ZipFile(archive,'w') as z:
            z.writestr('index.html',b'first');z.writestr('index.html',b'other')
    try:publisher.extract(archive,stage)
    except ValueError:pass
    else:raise AssertionError('Duplicate path accepted')
    assert not any(stage.iterdir())
    archive=root/'link.zip';stage=root/'symlink';stage.mkdir()
    with zipfile.ZipFile(archive,'w') as z:
        entry=zipfile.ZipInfo('assets/link');entry.create_system=3;entry.external_attr=(stat.S_IFLNK|0o777)<<16
        z.writestr(entry,'../escape')
    try:publisher.extract(archive,stage)
    except ValueError:pass
    else:raise AssertionError('Symlink accepted')
    assert not any(stage.iterdir());assert not (root/'escape').exists()
    archive=root/'valid.zip';stage=root/'valid';stage.mkdir()
    with zipfile.ZipFile(archive,'w') as z:
        z.writestr('index.html',b'synthetic entry');z.writestr('assets/late.js',b'synthetic asset')
    publisher.extract(archive,stage)
    assert (stage/'index.html').read_bytes()==b'synthetic entry'
    assert (stage/'assets/late.js').read_bytes()==b'synthetic asset'
print('Six rejected malicious archives; one safe archive extracted')
`;
  const result=spawnSync('python3',['-c',script],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr||result.error?.message||'Publisher subprocess failed');assert.match(result.stdout,/Six rejected/);
});
