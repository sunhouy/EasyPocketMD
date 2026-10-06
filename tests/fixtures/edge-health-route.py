import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[2]
def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module
deploy = load('health_route', 'deploy-docker.py')

class RouteHealth(unittest.TestCase):
    def test_health_error_retains_final_http_failure(self):
        error = HTTPError('http://127.0.0.1/api/health', 502, 'Bad Gateway', {}, None)
        output = io.StringIO()
        with patch.object(deploy.urllib.request, 'urlopen', side_effect=error), patch.object(deploy.time, 'sleep'), contextlib.redirect_stdout(output):
            with self.assertRaisesRegex(RuntimeError, 'HTTP Error 502'):
                deploy.health(3180, {})
        self.assertIn('Health attempt 40/40', output.getvalue())

    def test_candidate_logs_redact_request_and_tokens_and_probe_pinned_origin(self):
        state = subprocess.CompletedProcess([], 0, stdout=json.dumps({'Status':'running', 'Env':'secret-env', 'OOMKilled':False}), stderr='')
        logs = subprocess.CompletedProcess([], 0, stdout='access token=secret-access', stderr='[error] SSL certificate verify error request: "GET /api/files/ws?token=secret-token HTTP/1.1", upstream: "https://192.0.2.1/api/files/ws?token=secret-token"')
        probe = subprocess.CompletedProcess([], 60, stdout='', stderr='SSL certificate problem: unable to get local issuer certificate')
        output = io.StringIO()
        with patch.object(subprocess, 'run', side_effect=[state, logs, probe]) as run, contextlib.redirect_stdout(output):
            deploy.gateway_diagnostics('gateway', {'origin_ip':'192.0.2.1', 'domain':'md.example.com'})
        self.assertIn('SSL certificate verify error', output.getvalue())
        self.assertIn('exit=60', output.getvalue())
        self.assertNotIn('secret-', output.getvalue())
        self.assertIn('md.example.com:443:192.0.2.1', run.call_args.args[0])

if __name__ == '__main__':
    unittest.main()
