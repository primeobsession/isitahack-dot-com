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
edits=[]
for tag,i1,i2,j1,j2 in difflib.SequenceMatcher(None,ol,nl,autojunk=False).get_opcodes():
    if tag=='equal': continue
    os_,oe=off[i1],off[i2]; ns,ne=noff[j1],noff[j2]
    ot=old[os_:oe]; nt=new[ns:ne]
    p=0
    while p<min(len(ot),len(nt)) and ot[p]==nt[p]: p+=1
    q=0
    while q<min(len(ot),len(nt))-p and ot[-1-q]==nt[-1-q]: q+=1
    i1c=os_+p; i2c=oe-q; dn=nt[p:len(nt)-q]
    L=15
    while True:
        ci=max(0,i1c-L); ce=min(len(old),i2c+L)
        if old.count(old[ci:ce])==1: break
        L+=15
    edits.append((ci,ce,old[ci:i1c]+dn+old[i2c:ce]))
edits.sort()
for x,y in zip(edits,edits[1:]): assert x[1]<=y[0]
E=[{"old_string":old[ci:ce],"new_string":n} for ci,ce,n in edits]
t=old
for e in E:
    assert t.count(e['old_string'])==1; t=t.replace(e['old_string'],e['new_string'])
assert t==new
print(json.dumps(E,ensure_ascii=False))
