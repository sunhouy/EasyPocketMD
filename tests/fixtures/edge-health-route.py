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
route = load('ssh_route', 'select-deploy-route.py')
deploy = load('health_route', 'deploy-docker.py')

class RouteHealth(unittest.TestCase):
    def choose(self, speeds):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        config = Path(temporary.name) / 'ssh.conf'
        with patch.dict(os.environ, {'SERVER_USER': 'root', 'SERVER_HOST': '192.0.2.1', 'IP_US': '192.0.2.2', 'SERVER_SSH_HOST_KEY': ''}), patch.object(route, 'probe', side_effect=speeds), contextlib.redirect_stdout(io.StringIO()):
            chosen = route.select(Path(temporary.name) / 'key with spaces', config)
        return chosen, config

    def test_uses_relay_for_materially_faster_route(self):
        chosen, config = self.choose([33000, 300000])
        self.assertTrue(chosen)
        value = config.read_text()
        self.assertIn('ProxyCommand', value); self.assertIn("'", value)
        self.assertNotIn('SSHPASS', value)
        parsed = subprocess.run(['ssh', '-G', '-F', str(config), '192.0.2.1'], capture_output=True, text=True, check=True)
        self.assertIn('proxycommand ssh', parsed.stdout)

    def test_retains_direct_if_relay_does_not_improve(self):
        chosen, config = self.choose([33000, 35000])
        self.assertFalse(chosen); self.assertNotIn('ProxyCommand', config.read_text())

    def test_uses_available_route_if_other_fails(self):
        self.assertTrue(self.choose([None, 100000])[0])
        self.assertFalse(self.choose([100000, None])[0])

    def test_both_routes_failing_stops_before_upload(self):
        with self.assertRaisesRegex(RuntimeError, 'no image transfer started'):
            self.choose([None, None])

    def test_probe_stream_is_bounded_and_never_puts_password_in_arguments(self):
        with patch.object(subprocess, 'run') as run, patch.object(route.time, 'monotonic', side_effect=[0, 2]):
            self.assertEqual(route.probe([], 'root@192.0.2.1'), 1024 * 1024 / 2)
            self.assertEqual(run.call_args.kwargs['timeout'], 45)
            self.assertEqual(len(run.call_args.kwargs['input']), 1024 * 1024)
            self.assertEqual(run.call_args.args[0][-1], 'cat >/dev/null')
        with patch.object(subprocess, 'run', side_effect=subprocess.TimeoutExpired('ssh', 45)):
            self.assertIsNone(route.probe([], 'root@192.0.2.1'))

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
