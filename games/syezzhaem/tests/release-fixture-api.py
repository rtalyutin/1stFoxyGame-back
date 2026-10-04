"""Isolated process fixture for deployment coordination, not game API evidence."""
import json, os, signal, threading, time
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
lock=threading.Lock();state={'draining':False,'in_flight':0}
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def json(self,value,status=200):
        data=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def do_GET(self):
        if self.path=='/api/syezzhaem/v1/version':self.json({'api_build_id':os.environ['API_BUILD_ID'],'process_id':os.getpid(),'api_version':'v1','snapshot_schema_versions':[1],'supported_content_versions':['r1-map-1'],'supported_rules_versions':['r1-rules-1']});return
        if self.path=='/api/syezzhaem/v1/ready':self.json({'ok':os.environ.get('FIXTURE_READY','yes')=='yes','api_build_id':os.environ['API_BUILD_ID'],'checks':{'auth':True,'db':True,'releases':True}});return
        if self.path=='/internal/syezzhaem/drain-status':
            with lock:self.json({**state,'api_build_id':os.environ['API_BUILD_ID']})
            return
        if self.path=='/long':
            with lock:state['in_flight']+=1
            time.sleep(1)
            self.json({'completed':True})
            with lock:state['in_flight']-=1
            return
        self.json({'error':'unknown'},404)
    def do_POST(self):
        if self.path=='/internal/syezzhaem/drain' and self.headers.get('x-syezzhaem-operator-token')==os.environ.get('API_DRAIN_TOKEN'):
            with lock:state['draining']=True;self.json({**state,'api_build_id':os.environ['API_BUILD_ID']})
        else:self.json({'error':'forbidden'},403)
ThreadingHTTPServer(('127.0.0.1',int(os.environ['PORT'])),Handler).serve_forever()
