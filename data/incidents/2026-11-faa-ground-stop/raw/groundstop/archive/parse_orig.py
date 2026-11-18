import re, json
src=open('orig.tsx').read()
lines=src.split('\n')
def js_array(text):
    # text begins with '[' ; find matching bracket respecting strings
    depth=0;i=0;ins=False;esc=False
    for i,ch in enumerate(text):
        if ins:
            if esc: esc=False
            elif ch=='\\': esc=True
            elif ch=='"': ins=False
            continue
        if ch=='"': ins=True
        elif ch=='[': depth+=1
        elif ch==']':
            depth-=1
            if depth==0: return text[:i+1]
def tojson(a):
    a=re.sub(r',\s*([\]}])',r'\1',a)
    a=re.sub(r'(?<=[,\[])\s*(C|R|D)\s*(?=[\],])',lambda m:'"__%s"'%m.group(1),a)
    return json.loads(a)
out={}
for m in re.finditer(r'<Section heading="([^"]*)" id="([^"]*)"',src):
    sid=m.group(2)
    end=src.find('</Section>',m.end())
    body=src[m.end():end]
    tabs=[]
    for t in re.finditer(r'columns=\{(\[.*?\])\}\s*rows=\{',body,re.S):
        cols=json.loads(t.group(1))
        arr=js_array(body[t.end():])
        tabs.append({'columns':cols,'rows':tojson(arr)})
    out[sid]=tabs
    print(sid,[ (t['columns'],len(t['rows'])) for t in tabs])
json.dump(out,open('tables.json','w'),indent=1)
