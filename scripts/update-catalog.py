"""Refresh factual IDs/names/two-piece attributes from NetEase's public CBG config."""
from pathlib import Path
import json,re,urllib.request
SOURCE='https://cbg-yys.res.netease.com/js/game_auto_config.js'
with urllib.request.urlopen(SOURCE,timeout=30) as r: text=r.read().decode('utf8')
raw=json.loads(text[text.index('{'):].strip().rstrip(';'))
attr={'攻击加成':'attack_pct','生命加成':'hp_pct','防御加成':'defense_pct','暴击':'crit','效果命中':'hit','效果抵抗':'resist'}
sets=[]
for row in raw['yuhun_list']:
    bonus={}
    for name,key in attr.items():
        match=re.fullmatch(re.escape(name)+r'\+?([0-9.]+)%',row[3])
        if match: bonus[key]=float(match.group(1))
    sets.append({'id':str(row[0]),'name':row[1],'twoPiece':bonus})
rarity={1:'N',2:'R',3:'SR',4:'SSR',5:'SP',6:'UR'}
heroes=[{'id':str(h[0]),'name':h[1],'rarity':rarity.get(h[2],'MATERIAL'),'level':40,'star':6,'awakened':True,'shards':0,'base':{}} for h in raw['hero_list']]
out=Path(__file__).resolve().parent.parent/'src-tauri/data/catalog.json'
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps({'source':SOURCE,'sets':sets,'heroes':heroes},ensure_ascii=False,indent=2),'utf8')
print('Updated catalog:',len(sets),'sets,',len(heroes),'heroes')
