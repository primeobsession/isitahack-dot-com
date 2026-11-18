import sys,difflib,json
s=open(sys.argv[1],encoding='utf-8').read()
a=s.index('// ==== DATA START'); b=s.index('// ==== DATA END ====')
old=s[a:b]
new=open('/workspace/groundstop/data_block.ts',encoding='utf-8').read(); new=new[:new.index('// ==== DATA END ====')]
oh=old.split('\n',1)[0]; new=oh+'\n'+new.split('\n',1)[1]
ol=old.splitlines(True); nl=new.splitlines(True)
off=[0]
for x in ol: off.append(off[-1]+len(x))
noff=[0]
for x in nl: noff.append(noff[-1]+len(x))
raw=[]
for tag,i1,i2,j1,j2 in difflib.SequenceMatcher(None,ol,nl,autojunk=False).get_opcodes():
    if tag=='equal': continue
    ot=old[off[i1]:off[i2]]; nt=new[noff[j1]:noff[j2]]
    if ot.replace('"','')==nt.replace('"','') : continue  # quote-only
    sm=difflib.SequenceMatcher(None,ot,nt,autojunk=False)
    for t2,x1,x2,y1,y2 in sm.get_opcodes():
        if t2=='equal': continue
        raw.append([off[i1]+x1,off[i1]+x2,nt[y1:y2]])
# merge close raw edits
raw.sort(); m=[]
for e in raw:
    if m and e[0]-m[-1][1]<40:
        m[-1]=[m[-1][0],e[1],m[-1][2]+old[m[-1][1]:e[0]]+e[2]]
    else: m.append(e)
edits=[]
for i1c,i2c,dn in m:
    L=12
    while True:
        ci=max(0,i1c-L); ce=min(len(old),i2c+L)
        if old.count(old[ci:ce])==1: break
        L+=12
    edits.append((ci,ce,old[ci:i1c]+dn+old[i2c:ce]))
for x,y in zip(edits,edits[1:]): assert x[1]<=y[0]
E=[{"old_string":old[ci:ce],"new_string":n} for ci,ce,n in edits]
t=old
for e in E:
    assert t.count(e['old_string'])==1; t=t.replace(e['old_string'],e['new_string'])
open('/workspace/groundstop/expected_block.ts','w').write(t)
print(json.dumps(E,ensure_ascii=False))
