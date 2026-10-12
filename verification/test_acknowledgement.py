"""Regression for the Windows CI acknowledgement replace denial."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from run_desktop import acknowledge_phase


def denied():
    error = PermissionError('Windows acknowledgement replacement denied')
    error.winerror = 5
    return error


class AcknowledgementTests(unittest.TestCase):
    def test_transient_denial_keeps_complete_old_phase_until_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / 'measurement.json'
            ack = report.with_suffix('.ack')
            old = json.dumps({'phase': 'old', 'complete': True})
            ack.write_text(old, encoding='utf-8')
            replace = Path.replace
            rejected = False

            def contention(pending, target):
                nonlocal rejected
                if not rejected:
                    rejected = True
                    self.assertEqual(target.read_text(encoding='utf-8'), old)
                    self.assertEqual(json.loads(pending.read_text()), {'phase': 'next', 'complete': True})
                    raise denied()
                return replace(pending, target)

            with patch('run_desktop.platform.system', return_value='Windows'), patch.object(Path, 'replace', contention):
                acknowledge_phase(report, 'next')
            self.assertEqual(json.loads(ack.read_text()), {'phase': 'next', 'complete': True})
            self.assertFalse(report.with_suffix('.ack.pending').exists())

    def test_persistent_denial_fails_without_replacing_old_phase(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / 'measurement.json'
            ack = report.with_suffix('.ack')
            ack.write_text('{"phase":"old","complete":true}', encoding='utf-8')
            with patch('run_desktop.platform.system', return_value='Windows'), \
                    patch.object(Path, 'replace', side_effect=denied()), \
                    patch('run_desktop.time.monotonic', side_effect=[0, 1.01]):
                with self.assertRaises(PermissionError):
                    acknowledge_phase(report, 'next')
            self.assertEqual(json.loads(ack.read_text()), {'phase': 'old', 'complete': True})
            self.assertEqual(json.loads(report.with_suffix('.ack.pending').read_text()), {'phase': 'next', 'complete': True})

    def test_unrelated_error_propagates(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / 'measurement.json'
            with patch('run_desktop.platform.system', return_value='Windows'), \
                    patch.object(Path, 'replace', side_effect=OSError('unrelated failure')):
                with self.assertRaisesRegex(OSError, 'unrelated failure'):
                    acknowledge_phase(report, 'next')


if __name__ == '__main__':
    unittest.main()
