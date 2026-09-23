"""Regression checks for chronological fitting and status reconciliation."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('engine', ROOT / 'scripts/build-rotation-goblin-decision-engine.py')
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


class EngineTests(unittest.TestCase):
    def test_future_labels_cannot_change_first_fold_weights(self):
        rows, _, _ = engine.load_training_rows()
        before = engine.walk_forward_diagnostics(rows)
        changed = copy.deepcopy(rows)
        start = before['folds'][0]['validationStart']
        for row in changed:
            if row['date'] >= start:
                row['target'] = 1000 - row['target']
        after = engine.walk_forward_diagnostics(changed)
        self.assertEqual(before['folds'][0]['combined']['weights'], after['folds'][0]['combined']['weights'])
        dates = sorted({row['date'] for row in rows})
        tested = []
        for i, fold in enumerate(before['folds']):
            self.assertLess(fold['lastTrainingOutcome'], fold['validationStart'])
            tested.extend(d for d in dates if fold['validationStart'] <= d and (d < fold['validationEnd'] or (i == 4 and d == fold['validationEnd'])))
        self.assertEqual(len(tested), len(set(tested)))

    def test_status_reconciliation_is_idempotent_and_excludes_pr(self):
        workflow = (ROOT / '.github/workflows/record-rotation-goblin-status.yml').read_text()
        code = workflow.split("          python - <<'PY'\n", 1)[1].split('\n          PY', 1)[0]
        code = '\n'.join(line[10:] for line in code.splitlines())
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'src/features/rotation-goblin').mkdir(parents=True)
            run = dict(id=12, html_url='https://github.com/Mo4n6/tools/actions/runs/12', event='workflow_dispatch', head_sha='abc', head_branch='main', conclusion='success', created_at='2026-09-22T20:00:00Z', run_started_at='2026-09-22T20:00:00Z', updated_at='2026-09-22T20:01:00Z')
            runs = [dict(run, id=13, event='pull_request'), run, dict(run, id=11, created_at='2026-09-22T19:00:00Z')]
            payload = root / 'runs.json'
            payload.write_text(json.dumps({'workflow_runs': runs}))
            code = code.replace('/tmp/rotation-runs.json', str(payload))
            env = dict(os.environ, GITHUB_OUTPUT=str(root / 'outputs'))
            subprocess.run(['python', '-c', code], cwd=root, env=env, check=True)
            path = root / 'src/features/rotation-goblin/pipelineStatus.generated.ts'
            first = path.read_bytes()
            self.assertIn(b'runId: 12 as', first)
            subprocess.run(['python', '-c', code], cwd=root, env=env, check=True)
            self.assertEqual(first, path.read_bytes())


if __name__ == '__main__':
    unittest.main()
