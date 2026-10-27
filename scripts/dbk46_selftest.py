#!/usr/bin/env python3
"""Test DBK-46 offline extraction/dry-run using synthetic data only."""
import io, json, os, subprocess, sys, tarfile, tempfile
from pathlib import Path

HERE = Path(__file__).parent


def fixture(docs):
    td=tempfile.TemporaryDirectory()
    p=Path(td.name)/'test.tar.gz'
    content=''.join(json.dumps(d)+'\n' for d in docs).encode()
    with tarfile.open(p,'w:gz') as out:
        member=tarfile.TarInfo('data.ndjson'); member.size=len(content)
        out.addfile(member,io.BytesIO(content))
    return td,p


def run(docs):
    td,p=fixture(docs)
    try:
        env=os.environ.copy()
        env.pop('DATABASE_URL',None)
        r=subprocess.run(['node',str(HERE/'dbk46_archive.mjs'),str(p)],capture_output=True,text=True,env=env)
        return r
    finally:
        td.cleanup()


def main():
    r=run([{'_type':'auditEvent','_id':'auditEvent.1','_rev':'1'}, {'_type':'staffSession','_id':'session.1','_rev':'2'}, {'_type':'product','_id':'product.1'}])
    assert r.returncode==0,r.stderr
    x=json.loads(r.stdout)
    assert x['selectedDocuments']==2,x
    assert x['sourceCounts']=={'auditEvent':1,'staffSession':1},x
    assert x['deletionPermission'] is False
    print('PASS: selects only auditEvent/staffSession and excludes products')
    r=run([{'_type':'auditEvent','_id':'dupe'}, {'_type':'auditEvent','_id':'dupe'}])
    assert r.returncode!=0
    print('PASS: stops duplicate source document IDs')
    r=run([{'_type':'product','_id':'p1'}])
    assert r.returncode!=0
    print('PASS: refuses empty selected scope')
    print('3 offline checks passed; no network calls and no DB writes')


if __name__=='__main__': main()
