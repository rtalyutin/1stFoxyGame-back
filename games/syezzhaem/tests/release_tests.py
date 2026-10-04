import concurrent.futures, hashlib, http.server, importlib.util, json, os, pathlib, socket, stat, subprocess, sys, tempfile, threading, time, unittest, urllib.error, urllib.request, zipfile
PROJECT=pathlib.Path(__file__).resolve().parent.parent
PUBLISH=PROJECT/'scripts/publish.py';BLUEGREEN=PROJECT/'scripts/bluegreen.py'
def digest(data):return hashlib.sha256(data).hexdigest()
def port():
    with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def make_archive(path,build,marker=None):
    files={'index.html':('<script type="module" src="/games/syezzhaem/releases/'+build+'/assets/main.js"></script>').encode(),'assets/main.js':('import("./late.js"); // '+(marker or build)).encode(),'assets/late.js':('export const build="'+build+'";').encode()}
    m={'manifest_version':1,'build_id':build,'entry_url':'/games/syezzhaem/releases/'+build+'/','api_version':'v1','content_version':'r1-map-1','rules_version':'r1-rules-1','snapshot_schema_version':1,'level_id':'house-bridge-portal','files':{k:{'bytes':len(v),'sha256':digest(v)}for k,v in files.items()}}
    raw=json.dumps(m).encode()
    with zipfile.ZipFile(path,'w')as z:
        for k,v in files.items():z.writestr(k,v)
        z.writestr('release-manifest.json',raw)
    return m
class StaticFixture(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        if self.path=='/':data=b'first-game-version-and-data-stable';cache='no-store'
        elif self.path.startswith('/games/syezzhaem/'):
            path=self.server.root/self.path.removeprefix('/games/syezzhaem/')
            if not path.is_file():self.send_error(404);return
            data=path.read_bytes();cache='public, max-age=31536000, immutable' if '/releases/'in self.path else 'no-store'
            if self.server.corrupt and self.path.endswith('/assets/main.js'):data=b'corrupt proxy fixture'
        else:self.send_error(404);return
        self.send_response(200);self.send_header('Cache-Control',cache);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.dir=pathlib.Path(self.tmp.name);self.root=self.dir/'served';self.root.mkdir()
        self.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),StaticFixture);self.server.root=self.root;self.server.corrupt=False
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.origin='http://127.0.0.1:'+str(self.server.server_port)
        self.archives={}
        for build in ('r1-fixture-a','r1-fixture-b','r1-fixture-c'):
            path=self.dir/(build+'.zip');make_archive(path,build);self.archives[build]=path
    def tearDown(self):self.server.shutdown();self.server.server_close();self.tmp.cleanup()
    def publish(self,build,previous='none',fault=None):
        env={**os.environ,**({'SYEZZHAEM_PUBLISH_FAULT':fault}if fault else {})}
        return subprocess.run([sys.executable,str(PUBLISH),'publish','--root',str(self.root),'--archive',str(self.archives.get(build,build)),'--expected-previous',previous,'--verify-origin',self.origin],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    def active(self):return json.loads((self.root/'active.json').read_text())['build_id']
    def test_frontend_update_same_server_and_first_game_preserved(self):
        before=urllib.request.urlopen(self.origin+'/').read();pid=os.getpid()
        self.assertEqual(self.publish('r1-fixture-a').returncode,0)
        self.assertEqual(self.publish('r1-fixture-b','r1-fixture-a').returncode,0)
        self.assertEqual(self.active(),'r1-fixture-b');self.assertEqual(os.getpid(),pid)
        self.assertEqual(urllib.request.urlopen(self.origin+'/').read(),before)
        pointer=urllib.request.urlopen(self.origin+'/games/syezzhaem/active.json');self.assertEqual(pointer.headers['Cache-Control'],'no-store')
        old=urllib.request.urlopen(self.origin+'/games/syezzhaem/releases/r1-fixture-a/assets/late.js');self.assertIn('immutable',old.headers['Cache-Control']);self.assertIn(b'r1-fixture-a',old.read())
        self.assertEqual(self.publish('r1-fixture-a','r1-fixture-b').returncode,0);self.assertEqual(self.active(),'r1-fixture-a')
        self.assertTrue((self.root/'releases/r1-fixture-b/index.html').exists())
    def test_archive_paths_kinds_duplicates_and_build_collision_rejected(self):
        self.assertEqual(self.publish('r1-fixture-a').returncode,0)
        for name in ('../escape','/absolute','assets/../escape'):
            p=self.dir/'unsafe.zip'
            with zipfile.ZipFile(p,'w')as z:z.writestr(name,'bad')
            self.assertNotEqual(self.publish(p,'r1-fixture-a').returncode,0)
        p=self.dir/'unsafe.zip'
        with zipfile.ZipFile(p,'w')as z:
            e=zipfile.ZipInfo('assets/link');e.create_system=3;e.external_attr=(stat.S_IFLNK|0o777)<<16;z.writestr(e,'/tmp')
        self.assertNotEqual(self.publish(p,'r1-fixture-a').returncode,0)
        with zipfile.ZipFile(p,'w')as z:
            z.writestr('duplicate.js','one');z.writestr('duplicate.js','two')
        self.assertNotEqual(self.publish(p,'r1-fixture-a').returncode,0)
        changed=self.dir/'changed.zip';make_archive(changed,'r1-fixture-a','different bytes')
        self.assertNotEqual(self.publish(changed,'r1-fixture-a').returncode,0);self.assertEqual(self.active(),'r1-fixture-a');self.assertFalse((self.dir/'escape').exists())
    def test_interruption_recovery_and_corrupt_host_refusal(self):
        self.assertEqual(self.publish('r1-fixture-a').returncode,0)
        for point in ('after-staging','after-release','before-pointer'):
            self.assertLess(self.publish('r1-fixture-b','r1-fixture-a',point).returncode,0);self.assertEqual(self.active(),'r1-fixture-a')
            recovered=subprocess.run([sys.executable,str(PUBLISH),'recover','--root',str(self.root)],capture_output=True);self.assertEqual(recovered.returncode,0)
        self.assertLess(self.publish('r1-fixture-b','r1-fixture-a','after-pointer').returncode,0);self.assertEqual(self.active(),'r1-fixture-b')
        recovered=subprocess.run([sys.executable,str(PUBLISH),'recover','--root',str(self.root)],capture_output=True);self.assertEqual(recovered.returncode,0)
        (self.root/'releases/r1-fixture-b/assets/late.js').write_bytes(b'power-loss-corruption-fixture')
        recovered=subprocess.run([sys.executable,str(PUBLISH),'recover','--root',str(self.root)],capture_output=True);self.assertNotEqual(recovered.returncode,0)
    def test_publish_serialized_expected_previous_and_retention_guard(self):
        self.assertEqual(self.publish('r1-fixture-a').returncode,0)
        with concurrent.futures.ThreadPoolExecutor(2)as pool:results=list(pool.map(lambda b:self.publish(b,'r1-fixture-a'),('r1-fixture-b','r1-fixture-c')))
        self.assertEqual(sum(r.returncode==0 for r in results),1);self.assertIn(self.active(),('r1-fixture-b','r1-fixture-c'))
        cleanup=subprocess.run([sys.executable,str(PUBLISH),'cleanup','--root',str(self.root)],capture_output=True);self.assertNotEqual(cleanup.returncode,0);self.assertTrue((self.root/'releases/r1-fixture-a/index.html').exists())
    def test_http_dependency_digest_blocks_pointer(self):
        self.assertEqual(self.publish('r1-fixture-a').returncode,0);self.server.corrupt=True
        self.assertNotEqual(self.publish('r1-fixture-b','r1-fixture-a').returncode,0);self.assertEqual(self.active(),'r1-fixture-a')
    def test_packer_revalidates_release_before_archiving(self):
        dist=self.dir/'dist';dist.mkdir()
        with zipfile.ZipFile(self.archives['r1-fixture-a'])as archive:archive.extractall(dist)
        output=self.dir/'packed.zip';argv=[sys.executable,str(PROJECT/'scripts/pack-release.py'),'--dist',str(dist),'--output',str(output)]
        good=subprocess.run(argv,capture_output=True);self.assertEqual(good.returncode,0,good.stderr.decode());self.assertEqual(json.loads(good.stdout)['sha256'],digest(output.read_bytes()))
        (dist/'assets/main.js').write_text('tampered build')
        self.assertNotEqual(subprocess.run(argv,capture_output=True).returncode,0)
class BluegreenTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.dir=pathlib.Path(self.tmp.name);self.processes=[];self.old_port=port();self.new_port=port();self.token='local-test-operator-token-'+'x'*32
        self.old=subprocess.Popen([sys.executable,str(PROJECT/'tests/release-fixture-api.py')],env={**os.environ,'PORT':str(self.old_port),'API_BUILD_ID':'r1-api-old','API_DRAIN_TOKEN':self.token},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);self.processes.append(self.old)
        self.wait(self.old_port)
        self.upstream=self.dir/'upstream.conf';self.upstream.write_text('server 127.0.0.1:'+str(self.old_port)+';\n')
        self.c={'old_build_id':'r1-api-old','new_build_id':'r1-api-new','old_port':self.old_port,'new_port':self.new_port,'old_pid':self.old.pid,'upstream_file':str(self.upstream),'new_command':[sys.executable,str(PROJECT/'tests/release-fixture-api.py')],'migration_command':[sys.executable,'-c','pass'],'game_smoke_command':[sys.executable,'-c','pass'],'nginx_test_command':[sys.executable,'-c','pass'],'nginx_reload_command':[sys.executable,'-c','pass'],'drain_timeout_seconds':5}
    def tearDown(self):
        for p in self.processes:
            if p.poll()is None:p.terminate();p.wait(timeout=5)
        state=self.dir/'state.json'
        if state.exists():
            pid=json.loads(state.read_text()).get('new_pid')
            try:os.kill(pid,15)
            except ProcessLookupError:pass
        self.tmp.cleanup()
    def wait(self,p):
        end=time.monotonic()+5
        while time.monotonic()<end:
            try:return urllib.request.urlopen('http://127.0.0.1:'+str(p)+'/api/syezzhaem/v1/version').read()
            except OSError:time.sleep(.02)
        self.fail('fixture API did not start')
    def execute(self,extra=None):
        cfg=self.dir/'config.json';cfg.write_text(json.dumps(self.c))
        return subprocess.run([sys.executable,str(BLUEGREEN),'execute','--config',str(cfg),'--state',str(self.dir/'state.json')],env={**os.environ,'API_DRAIN_TOKEN':self.token,**(extra or {})},capture_output=True)
    def test_failed_readiness_keeps_old_upstream_and_process(self):
        before=self.upstream.read_bytes();r=self.execute({'FIXTURE_READY':'no'});self.assertNotEqual(r.returncode,0);self.assertEqual(self.upstream.read_bytes(),before);self.assertIsNone(self.old.poll());self.assertFalse((self.dir/'state.json').exists())
    def test_cutover_waits_for_accepted_old_request_before_stop(self):
        with concurrent.futures.ThreadPoolExecutor()as pool:
            response=pool.submit(lambda:urllib.request.urlopen('http://127.0.0.1:'+str(self.old_port)+'/long').read());time.sleep(.05)
            r=self.execute();self.assertEqual(r.returncode,0,r.stderr.decode());self.assertEqual(json.loads(response.result())['completed'],True)
        state=json.loads((self.dir/'state.json').read_text());self.assertEqual(state['operation_status'],'VERIFIED');self.assertEqual(state['drain_in_flight'],0);self.assertIn(str(self.new_port),self.upstream.read_text());self.old.wait(timeout=5)
    def test_incompatible_rollback_is_rejected(self):
        spec=importlib.util.spec_from_file_location('bluegreen',BLUEGREEN);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        old={'snapshot_schema_versions':[1],'supported_content_versions':['r1-map-1'],'supported_rules_versions':['r1-rules-1'],'api_version':'v1'}
        new={**old,'snapshot_schema_versions':[1,2]}
        with self.assertRaises(ValueError):m.compatible(old,new)
if __name__=='__main__':unittest.main()
