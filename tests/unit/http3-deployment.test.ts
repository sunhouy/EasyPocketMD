import {spawnSync} from 'node:child_process';
import path from 'node:path';
it('advertises HTTP/3 only on a supported public Nginx, including IPv6 listeners',()=>{
 const code=`import importlib.util,subprocess
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('deploy','scripts/deploy-docker.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with patch.object(m,'command',return_value=subprocess.CompletedProcess([],0,stdout='',stderr='configure arguments: --with-http_v3_module')):
 value=m.http3_settings('nginx','    listen 443 ssl;\\n    listen [::]:443 ssl;')
 assert 'listen 443 quic;' in value and 'listen [::]:443 quic;' in value
 assert 'http3 on;' in value and 'Alt-Svc' in value and 'ma=86400' in value
with patch.object(m,'command',return_value=subprocess.CompletedProcess([],0,stdout='',stderr='configure arguments: --with-http_ssl_module')):
 assert m.http3_settings('nginx','listen 443 ssl;')==''
`;
 const result=spawnSync('python3',['-c',code],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8'});expect(result.stderr).toBe('');expect(result.status).toBe(0);
});
