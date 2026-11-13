"""Create a private live-API fixture payload. Does not deploy, read or copy API keys."""
import base64
import hashlib
import json
from pathlib import Path
import zlib

ROOT = Path(__file__).resolve().parents[1]
ACCOUNT = ROOT.parent / 'copilot-account-next'
FILES = {}
for name in ('akaun_pelayan.py','pelanggan_akaun.py','pelanggan_kuota.py','pelanggan_meja.py','pelanggan_copilot.py','pelanggan_pangkalan.py'):
    FILES['account/'+name] = (ACCOUNT/name).read_text()
for name in ('penasihat','copilot-kuta','copilot-nasihat','copilot-intelligence','copilot-openai','copilot-realtime'):
    FILES['advice/src/lib/'+name+'.ts'] = (ROOT/'src/lib'/f'{name}.ts').read_text()
for name in ('bijak','suara'):
    path=f'src/app/api/copilot/{name}/route.ts'
    FILES['advice/'+path]=(ROOT/path).read_text()
for name in ('hooks.mjs','resolve-ts.mjs','live-copilot-intelligence.mts'):
    FILES['advice/tests/'+name]=(ROOT/'tests'/name).read_text()
FILES['advice/package.json']='{"type":"module"}'
FILES['account/qa_server.py']='''import ssl
from http.server import ThreadingHTTPServer
from akaun_pelayan import ikat
from pelanggan_pangkalan import buka
server=ThreadingHTTPServer(('0.0.0.0',443),ikat(buka,True))
ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain('/qa/cert.pem','/qa/key.pem')
server.socket=ctx.wrap_socket(server.socket,server_side=True)
server.serve_forever()
'''
FILES['init.sql']="CREATE ROLE copilot_akaun_qa LOGIN PASSWORD 'synthetic-account-db';\nCREATE DATABASE copilot_akaun_qa OWNER copilot_akaun_qa;\n"
compose={'services': {
    'postgres': {'image':'postgres:16.15-bookworm','environment':{'POSTGRES_PASSWORD':'synthetic-init-only'},
        'tmpfs':['/var/lib/postgresql/data'],'volumes':['./init.sql:/docker-entrypoint-initdb.d/qa.sql:ro'],
        'networks':['qa'],'mem_limit':'256m','cpus':0.5,'restart':'no',
        'command':['postgres','-c','shared_buffers=32MB','-c','max_connections=30'],
        'healthcheck':{'test':['CMD-SHELL','pg_isready -U postgres -d copilot_akaun_qa'],'interval':'2s','timeout':'2s','retries':30}},
    'account': {'image':'copilot-account:6417db74a4cca2354a675cdee8ccea6e804410d1','entrypoint':['python3','-u','qa_server.py'],
        'working_dir':'/qa/account','volumes':['./:/qa:ro'],'read_only':True,'tmpfs':['/tmp'],'user':'0:0','cap_drop':['ALL'],
        'environment':{'PYTHONDONTWRITEBYTECODE':'1','AKAUN_SECRET':'synthetic-account-signing-only','COPILOT_KUTA_SECRET':'synthetic-service-signing-only',
            'ACCOUNT_DATABASE_URL':'postgresql://copilot_akaun_qa:synthetic-account-db@postgres:5432/copilot_akaun_qa',
            'ACCOUNT_DATABASE_NAME':'copilot_akaun_qa','ACCOUNT_DATABASE_ROLE':'copilot_akaun_qa'},
        'networks':{'qa':{'aliases':['copilot-qa.beshareaisolution.com']}},'mem_limit':'256m','cpus':0.5,'restart':'no',
        'depends_on':{'postgres':{'condition':'service_healthy'}},
        'healthcheck':{'test':['CMD','python3','-c',"import ssl,urllib.request;urllib.request.urlopen('https://copilot-qa.beshareaisolution.com/healthz',context=ssl.create_default_context(cafile='/qa/cert.pem'))"],'interval':'3s','timeout':'3s','retries':20}},
    'tests': {'image':'copilot-advice:978966eafb1e91a5ea3b066bc16b66ac064fa420',
        'entrypoint':['node','--experimental-strip-types','--import','./tests/resolve-ts.mjs','./tests/live-copilot-intelligence.mts'],
        'working_dir':'/qa/advice','volumes':['./:/qa:ro'],'read_only':True,'tmpfs':['/tmp'],'user':'0:0','cap_drop':['ALL'],
        'env_file':['/opt/beshare-copilot-production/copilot-openai.env'],
        'environment':{'NODE_ENV':'test','NODE_EXTRA_CA_CERTS':'/qa/cert.pem','COPILOT_AKAUN_URL':'https://copilot-qa.beshareaisolution.com',
            'COPILOT_AKAUN_HOST':'copilot-qa.beshareaisolution.com','COPILOT_KUTA_SECRET':'synthetic-service-signing-only',
            'COPILOT_REALTIME_ENABLED':'true','COPILOT_LIVE_QA':'synthetic-only'},
        'networks':['qa','provider'],'mem_limit':'512m','cpus':0.5,'restart':'no',
        'depends_on':{'account':{'condition':'service_healthy'}}},
},'networks':{'qa':{'internal':True},'provider':{}}}
FILES['compose.json']=json.dumps(compose)
raw=json.dumps(FILES).encode()
if __name__=='__main__':
    print(json.dumps({'bundle':base64.b64encode(zlib.compress(raw,9)).decode(),'sha256':hashlib.sha256(raw).hexdigest(),'files':list(FILES)}))
