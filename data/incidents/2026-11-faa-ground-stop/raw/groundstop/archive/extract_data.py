"""One-time extraction of the data in the 7:06 PM Page source (orig.tsx) into CSV files."""
import re, json, csv
src=open('orig.tsx').read()
T=json.load(open('tables.json'))
D='data/'
def w(name, header, rows):
    with open(D+name,'w',newline='') as f:
        cw=csv.writer(f, lineterminator='\n'); cw.writerow(header)
        for r in rows: cw.writerow(r)
    print(name, len(rows))
lab=lambda v: v[2:] if isinstance(v,str) and v.startswith('__') else v
def tab(sid): return [[lab(c) for c in r] for r in T[sid][0]['rows']]
def section(sid):
    m=re.search(r'<Section heading="[^"]*" id="%s"'%re.escape(sid),src); e=src.find('</Section>',m.end()); return src[m.end():e]
S=r'"((?:[^"\\]|\\.)*)"'
un=lambda s: json.loads('"'+s+'"')
def objs(body, keys):
    out=[]
    for line in body.split('\n'):
        line=line.strip()
        if not line.startswith('{'): continue
        row=[]
        for k in keys:
            m=re.search(r'\b%s: (?:%s|(true|false|[0-9.]+))'%(k,S),line)
            row.append('' if not m else (un(m.group(1)) if m.group(1) is not None else m.group(2)))
        out.append(row)
    return out
# glance
w('glance_metrics.csv',['value','label','detail','tone'],objs(section('glance').split('<Table')[0],['value','label','detail','tone']))
w('glance_figures.csv',['figure','source'],tab('glance'))
m=re.search(r'<Callout lead="Working read">\s*(.*?)\s*</Callout>',section('glance'),re.S)
working=m.group(1)
# key events
w('key_events.csv',['time_et','title','detail'],[[ *(lambda t:(t.split(': ',1)))(r[0]), r[1]] for r in objs(section('viz-events'),['title','detail'])])
pts=lambda sid: [(l,v) for l,v in re.findall(r'\{ label: "([^"]*)", value: ([0-9.]+) \}',section(sid))]
w('cancellations.csv',['time_et','cancellations'],pts('viz-cancels'))
w('delays.csv',['time_et','delays'],pts('viz-delays'))
sec=re.search(r'values: \[([^\]]*)\]',section('viz-metering')).group(1).split(',')
sec=['' if x.strip()=='NaN' else x.strip() for x in sec]
w('flights_in_air.csv',['time_et','today','yesterday_same_time'],[(l,v,sec[i]) for i,(l,v) in enumerate(pts('viz-metering'))])
bars=objs(section('viz-airports'),['label','value','display'])
ab=[]
for l,v,d in bars:
    a,t=re.match(r'(.*) \((.*)\)$',l).groups(); ab.append([a,t,v,d])
w('airport_delays.csv',['airport','time_et','avg_delay_min','display'],ab)
w('timeline_events.csv',['time_et','event','evidence','label'],tab('timeline'))
w('thread_results.csv',['thread','verdict','confidence','sources'],tab('thread-results'))
w('side_threads.csv',['item','finding','label'],tab('threads'))
w('sdr_search.csv',['source','result','label'],tab('sdr'))
w('official_sources.csv',['statement','source'],tab('official'))
w('carriers.csv',['title','detail'],objs(section('carriers'),['title','detail']))
w('ruled_out.csv',['area','finding','source'],tab('ruled-out'))
w('open_items.csv',['item','status','note'],[[t,'done' if d=='true' else 'open',n] for t,d,n in objs(section('open'),['text','done','meta'])])
w('smart_docs.csv',['source','what_it_says','support'],tab('smart-docs'))
w('smart_procurement.csv',['item','record','support','label'],tab('procurement'))
w('update_log.csv',['time_et','update'],tab('log'))
w('sources.csv',['title','site','href'],objs(section('sources'),['title','site','href']))
json.dump({'working_read':working},open('narrative.json','w'))
