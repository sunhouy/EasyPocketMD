import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('progress_resources', ROOT / 'scripts/deploy-resources.py')
resources = importlib.util.module_from_spec(spec); spec.loader.exec_module(resources)

class Progress(unittest.TestCase):
    def test_plan_counts_unique_objects_and_excludes_existing_objects(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / 'objects').mkdir()
            (root / 'objects' / ('a' * 64 + '.gz')).touch()
            members = [{'sha256': digest * 64, 'size': 3 * resources.MIB, 'compressed_size': size * resources.MIB} for digest, size in [('a', 1), ('b', 2), ('b', 2)]]
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                missing = resources.transfer_plan(root, {'members': members})
            self.assertEqual(missing, {'b' * 64: 2 * resources.MIB})
            self.assertIn('2 total, 1 reused, 1 missing', output.getvalue())
            self.assertIn('upload 2.00 MiB', output.getvalue())

    def test_failed_stage_logs_time_and_preserves_the_failure(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            with self.assertRaisesRegex(ValueError, 'failure'):
                with resources.stage('Import'):
                    raise ValueError('failure')
        self.assertIn('START Import', output.getvalue())
        self.assertIn('FAILED Import (', output.getvalue())
        self.assertNotIn('DONE Import', output.getvalue())

if __name__ == '__main__':
    unittest.main()
