#!/usr/bin/env python3
"""Dedicated API cutover, with explicit commands from a trusted operator config.

No first-game upstream is read or changed. Preparation (`plan`) has no writes.
`execute` starts a new process; it never installs code into the old process.
"""
import argparse, fcntl, json, os, pathlib, signal, subprocess, sys, time, urllib.error, urllib.request
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from publish import atomic_json, syncdir, synced_write

def http(url,method='GET',token=None):
    headers={'Content-Type':'application/json','Cache-Control':'no-store'}
    if token:headers['x-syezzhaem-operator-token']=token
    req=urllib.request.Request(url,data=b'{}' if method=='POST' else None,method=method,headers=headers)
    with urllib.request.urlopen(req,timeout=3) as r:return json.loads(r.read())
def command(value):
    if not isinstance(value,list) or not value or any(not isinstance(x,str) or not x for x in value):raise ValueError('Command must be a nonempty argv array')
    return value
def config(path):
    c=json.loads(pathlib.Path(path).read_text())
    for key in ('new_build_id','old_build_id','new_port','old_port','upstream_file','new_command','migration_command','game_smoke_command','nginx_test_command','nginx_reload_command','old_pid','drain_timeout_seconds'):
        if key not in c:raise ValueError('Missing operator configuration: '+key)
    if any(type(c[x])is not int or not 1024<=c[x]<=65535 for x in ('new_port','old_port')) or c['new_port']==c['old_port']:raise ValueError('Both API ports must be distinct loopback ports')
    if not 1<=c['drain_timeout_seconds']<=300:raise ValueError('Invalid bounded drain timeout')
    if type(c['old_pid'])is not int or c['old_pid']<=1:raise ValueError('Replace old_pid with the confirmed dedicated Node process ID')
    for key in ('new_command','migration_command','game_smoke_command','nginx_test_command','nginx_reload_command'):command(c[key])
    if pathlib.Path(c['upstream_file']).name!='upstream.conf':raise ValueError('Only dedicated upstream.conf may be replaced')
    return c
def run(argv,c,env=None):
    result=subprocess.run(command(argv),cwd=c.get('working_directory'),env=env or os.environ.copy(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60)
    if result.returncode:raise ValueError('Operator command failed with exit code '+str(result.returncode))
def write_upstream(path,port):
    path=pathlib.Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_name('.upstream.conf.'+str(os.getpid()));synced_write(temp,('server 127.0.0.1:'+str(port)+';\n').encode())
    os.replace(temp,path);syncdir(path.parent)
def compatible(reader,writer):
    # Explicit version-contract intersection. Exact code behavior is QA evidence.
    def normalize(v):return {'snapshot_schema_versions':v.get('snapshot_schema_versions'),'content_versions':v.get('supported_content_versions'),'rules_versions':v.get('supported_rules_versions'),'api_versions':[v.get('api_version')]}
    r=normalize(reader);w=normalize(writer)
    for kind in ('snapshot_schema_versions','content_versions','rules_versions','api_versions'):
        if not isinstance(r.get(kind),list) or not isinstance(w.get(kind),list) or not set(w[kind]).issubset(set(r[kind])):raise ValueError('Rollback/mixed-version compatibility not established for '+kind)
def execute(c,state_path):
    old_base='http://127.0.0.1:'+str(c['old_port']);new_base='http://127.0.0.1:'+str(c['new_port'])
    version_path='/api/syezzhaem/v1/version';ready_path='/api/syezzhaem/v1/ready'
    token=os.environ.get('API_DRAIN_TOKEN')
    if not token or len(token)<32:raise ValueError('Stable API_DRAIN_TOKEN is required for both API processes')
    old=http(old_base+version_path)
    if old.get('api_build_id')!=c['old_build_id'] or old.get('process_id')!=c['old_pid']:raise ValueError('Old process version/PID does not match plan')
    upstream=pathlib.Path(c['upstream_file']);previous=upstream.read_bytes()
    expected=('server 127.0.0.1:'+str(c['old_port'])+';\n').encode()
    if previous!=expected:raise ValueError('Dedicated upstream differs from expected old process')
    run(c['migration_command'],c) # Single owner/lock, additive migration script.
    env={**os.environ,'HOST':'127.0.0.1','PORT':str(c['new_port']),'API_BUILD_ID':c['new_build_id']}
    log=pathlib.Path(state_path).with_suffix('.new-api.log');log.parent.mkdir(parents=True,exist_ok=True)
    with open(log,'ab') as output:
        child=subprocess.Popen(c['new_command'],cwd=c.get('working_directory'),env=env,stdout=output,stderr=output)
    cutover=False
    try:
        deadline=time.monotonic()+30
        while True:
            if child.poll() is not None:raise ValueError('New API exited before readiness')
            try:
                ready=http(new_base+ready_path)
                if ready.get('ok')is not True or ready.get('api_build_id')!=c['new_build_id'] or not all(ready.get('checks',{}).get(k)is True for k in ('auth','db','releases')):raise ValueError('New API readiness checks failed')
                break
            except (OSError,urllib.error.URLError):
                if time.monotonic()>=deadline:raise ValueError('New API readiness timed out')
                time.sleep(.1)
        new=http(new_base+version_path)
        if new.get('api_build_id')!=c['new_build_id'] or new.get('process_id')!=child.pid:raise ValueError('New API version/PID mismatch')
        compatible(old,new);compatible(new,old)
        run(c['game_smoke_command'],c,{**env,'SYEZZHAEM_SMOKE_ORIGIN':new_base})
        write_upstream(upstream,c['new_port'])
        try:run(c['nginx_test_command'],c);run(c['nginx_reload_command'],c)
        except Exception:
            write_upstream(upstream,c['old_port']);run(c['nginx_test_command'],c);run(c['nginx_reload_command'],c);raise
        cutover=True
        state={'operation_status':'CUTOVER_DRAINING','old_build_id':c['old_build_id'],'new_build_id':c['new_build_id'],'old_pid':c['old_pid'],'new_pid':child.pid,'old_port':c['old_port'],'new_port':c['new_port'],'old_version':old,'new_version':new,'upstream_file':str(upstream),'database_rollback':'never-automatic'}
        atomic_json(pathlib.Path(state_path),state)
        http(old_base+'/internal/syezzhaem/drain','POST',token)
        deadline=time.monotonic()+c['drain_timeout_seconds']
        while True:
            drained=http(old_base+'/internal/syezzhaem/drain-status',token=token)
            if drained.get('api_build_id')!=c['old_build_id'] or drained.get('draining')is not True:raise ValueError('Old process did not confirm drain')
            if drained.get('in_flight')==0:break
            if time.monotonic()>=deadline:raise ValueError('Drain timed out; old API is retained')
            time.sleep(.05)
        os.kill(c['old_pid'],signal.SIGTERM)
        state['operation_status']='VERIFIED';state['drain_in_flight']=0;atomic_json(pathlib.Path(state_path),state)
        print(json.dumps({k:state[k] for k in ('operation_status','old_build_id','new_build_id','old_pid','new_pid','drain_in_flight')}))
    except Exception:
        if not cutover:
            child.terminate()
            try:child.wait(timeout=5)
            except subprocess.TimeoutExpired:child.kill();child.wait()
        # After cutover a failure retains both processes for explicit recovery.
        raise
def main():
    p=argparse.ArgumentParser();p.add_argument('action',choices=['plan','execute']);p.add_argument('--config',required=True);p.add_argument('--state',default='bluegreen-state.json');a=p.parse_args();c=config(a.config)
    if a.action=='plan':print(json.dumps({'operation_status':'PREPARED','old_build_id':c['old_build_id'],'new_build_id':c['new_build_id'],'old_port':c['old_port'],'new_port':c['new_port'],'target':c['upstream_file'],'actions':['additive locked migration','start new API process','verify readiness and compatibility','syntax-check/reload dedicated upstream','drain accepted old requests','stop old process after drain'],'external_operations':'not-executed'}))
    else:
        lock_path=pathlib.Path(c['upstream_file']).with_name('.bluegreen.lock')
        with open(lock_path,'a+') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX);execute(c,a.state)
if __name__=='__main__':
    try:main()
    except (ValueError,OSError,urllib.error.URLError,json.JSONDecodeError,subprocess.SubprocessError) as e:print(json.dumps({'operation_status':'FAIL','error':str(e)}),file=sys.stderr);sys.exit(1)
