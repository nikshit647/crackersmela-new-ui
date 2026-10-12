from pathlib import Path
import copy
import json
import os
import shutil
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
PHP=ROOT/'audit-evidence/tools/php-8.3.35/php.exe'
SCRIPT=ROOT/'audit/migrate-cms-copy.php'

class CmsCopyMigration(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='cms-copy-test-',dir=ROOT/'audit-evidence')
        self.base=Path(self.temp.name); self.web=self.base/'public';self.data=self.base/'data';self.work=self.base/'backup'
        self.web.mkdir();(self.data/'cms-pages').mkdir(parents=True)
        shutil.copyfile(ROOT/'audit-evidence/production-release/cm-security.php',self.web/'cm-security.php')
        self.record={'version':7,'publishedVersion':6,'savedAt':'old','publishedAt':'old','revisions':[{'document':{'text':'PESO-certified history'}}],
            'draft':{'id':'home','sections':[{'id':'home:hero','name':'PESO-certified admin name','styles':{'mobile':{'fontFamily':'PESO-certified'}},'content':{'messages':[{'text':'PESO-certified','href':'/PESO-certified'}]},'elements':{'e1':{'text':'STANDARD-certified, safety-tested stock only','name':'PESO-certified descriptor','url':'/PESO-certified'}}}], 'seo':{'title':'PESO-certified crackers','canonical':'https://example.test/PESO-certified'}},
            'published':None}
        self.record['published']=copy.deepcopy(self.record['draft'])
        self.path=self.data/'cms-pages/home.json';self.path.write_text(json.dumps(self.record))
        self.original=self.path.read_bytes()
        self.env={**os.environ,'CM_DATA_DIR':str(self.data)}
    def tearDown(self):self.temp.cleanup()
    def call(self,mode,success=True):
        p=subprocess.run([str(PHP),str(SCRIPT),mode,str(self.web),str(self.work)],env=self.env,capture_output=True,text=True)
        self.assertEqual(p.returncode==0,success,p.stdout+p.stderr)
        return json.loads(p.stdout) if success else p.stderr
    def test_apply_is_scoped_idempotent_and_rollback_exact(self):
        self.assertEqual(self.call('prepare')['files'],1)
        self.assertEqual(self.path.read_bytes(),self.original)
        self.assertEqual(self.call('apply')['status'],'APPLIED')
        after=json.loads(self.path.read_text());self.assertEqual(after['version'],8);self.assertEqual(after['publishedVersion'],8)
        for phase in ('draft','published'):
            doc=after[phase];sec=doc['sections'][0]
            self.assertEqual(sec['elements']['e1']['text'],'STANDARD Licensed dealer')
            self.assertEqual(sec['content']['messages'][0]['text'],'STANDARD Licensed dealer')
            self.assertEqual(sec['elements']['e1']['name'],'PESO-certified descriptor')
            self.assertEqual(sec['elements']['e1']['url'],'/PESO-certified')
            self.assertEqual(sec['styles'],self.record[phase]['sections'][0]['styles'])
            self.assertEqual(doc['seo']['canonical'],self.record[phase]['seo']['canonical'])
        self.assertEqual(after['revisions'],self.record['revisions'])
        self.assertEqual(self.call('apply')['status'],'ALREADY_APPLIED')
        self.assertEqual(self.call('rollback')['status'],'ROLLED_BACK')
        self.assertEqual(self.path.read_bytes(),self.original)
    def test_concurrent_edit_refuses_before_any_write(self):
        self.call('prepare');self.record['version']=99;self.path.write_text(json.dumps(self.record));current=self.path.read_bytes()
        self.assertIn('changed after preparation',self.call('apply',False));self.assertEqual(self.path.read_bytes(),current)
    def test_rollback_preserves_later_edits(self):
        self.call('prepare');self.call('apply');self.path.write_text(json.dumps({'version':100}));current=self.path.read_bytes()
        self.assertIn('Later CMS edits',self.call('rollback',False));self.assertEqual(self.path.read_bytes(),current)
    def test_legacy_store_and_no_changes(self):
        self.path.unlink();p=self.data/'cms-pages.json';p.write_text(json.dumps({'schemaVersion':1,'pages':{'home':self.record}}))
        self.assertEqual(self.call('prepare')['files'],1);self.call('apply')
        self.assertEqual(json.loads(p.read_text())['pages']['home']['version'],8)
        self.assertEqual(self.call('prepare')['files'],0)
    def applied_two_pages(self):
        other=self.data/'cms-pages/about.json'
        record=copy.deepcopy(self.record)
        for phase in ('draft','published'):record[phase]['id']='about'
        other.write_text(json.dumps(record))
        paths=[other,self.path]
        before={path:path.read_bytes() for path in paths}
        self.assertEqual(self.call('prepare')['files'],2)
        self.assertEqual(self.call('apply')['files'],2)
        return paths,before
    def test_rollback_recovers_partial_apply(self):
        paths,before=self.applied_two_pages()
        # Receipt exists for both files, but the interrupted apply only wrote one.
        paths[1].write_bytes(before[paths[1]])
        self.assertEqual(self.call('rollback')['status'],'ROLLED_BACK')
        for path in paths:self.assertEqual(path.read_bytes(),before[path])
    def test_rollback_resumes_partial_rollback_and_is_idempotent(self):
        paths,before=self.applied_two_pages()
        # An earlier rollback restored the first file and stopped.
        paths[0].write_bytes(before[paths[0]])
        self.assertEqual(self.call('rollback')['status'],'ROLLED_BACK')
        for path in paths:self.assertEqual(path.read_bytes(),before[path])
        self.assertEqual(self.call('rollback')['status'],'ROLLED_BACK')
        for path in paths:self.assertEqual(path.read_bytes(),before[path])
    def test_partial_rollback_refuses_third_state_before_any_write(self):
        paths,before=self.applied_two_pages()
        paths[1].write_text(json.dumps({'version':100,'manual':'Later content'}))
        current={path:path.read_bytes() for path in paths}
        self.assertIn('Later CMS edits',self.call('rollback',False))
        for path in paths:self.assertEqual(path.read_bytes(),current[path])
    def test_rollback_validates_every_backup_before_any_write(self):
        paths,before=self.applied_two_pages()
        receipt_path=self.work/'cms-copy-receipt.json'
        receipt=json.loads(receipt_path.read_text())
        receipt['files'][1]['beforeBase64']='bm90IHRoZSBvcmlnaW5hbA=='
        receipt_path.write_text(json.dumps(receipt))
        current={path:path.read_bytes() for path in paths}
        self.assertIn('Backup checksum mismatch',self.call('rollback',False))
        for path in paths:self.assertEqual(path.read_bytes(),current[path])

if __name__=='__main__':unittest.main(verbosity=2)
