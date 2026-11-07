//! Convert our own read-only capture to the application's local document.
use crate::model::*;
use serde_json::{json,Value};
use std::collections::{BTreeMap,HashMap,HashSet};
type Result<T> = std::result::Result<T,String>;

fn key(v:&Value)->String{v.as_str().map(str::to_owned).unwrap_or_else(||v.to_string())}
fn n(v:&Value)->f64{v.as_f64().unwrap_or(0.0)}
fn integer(v:&Value)->u8{v.as_u64().unwrap_or(0).min(255) as u8}
fn yes(v:&Value)->bool{v.as_bool().unwrap_or_else(||n(v)!=0.0)}
fn count(v:&Value)->u32{n(v).max(0.0).min(u32::MAX as f64) as u32}
pub fn set_definition(row:&Value)->Option<SetDef>{
    let attributes=|index:usize|{
        let mut stats=Stats::new();
        for value in row["suit_attr_list"][index].as_array().into_iter().flatten(){
            if let Some(raw)=value[0].as_str(){if let Ok((name,factor))=attr(raw){stats.insert(name.into(),n(&value[1])*factor);}}
        }
        stats
    };
    Some(SetDef{name:row["suit_n"].as_str()?.into(),two_piece:attributes(1),six_piece:attributes(5)})
}
pub fn bundled_set_definitions()->&'static Vec<SetDef>{
    static SETS:std::sync::OnceLock<Vec<SetDef>>=std::sync::OnceLock::new();
    SETS.get_or_init(||{
        let equipment:Value=serde_json::from_str(include_str!("../data/equipment.json")).expect("bundled equipment facts");
        equipment["equip_suit"].as_object().into_iter().flat_map(|rows|rows.values()).filter_map(set_definition).collect()
    })
}
pub fn task_snapshot(raw:&Value)->Value{
    let facts:Vec<_>=raw["daily_task"].as_object().into_iter().flatten().map(|(id,progress)|{
        let config=&raw["configs"]["daily_task"][id];let target=config["max_times"].as_f64().filter(|n|*n>0.0);let current=progress["cur_times"].as_f64();
        json!({"id":id,"name":config["a_ui_title"].as_str().unwrap_or("未识别任务"),"current":current,"target":target,"completed":current.zip(target).map(|(n,total)|n>=total)})
    }).collect();
    json!({"capturedAt":raw["reader"]["capturedAt"],"dailyTimestamp":raw["daily_task_timestamp"],"routines":raw["routineProgress"],"rules":{"retreat":raw["configs"]["active_time"]["guild_boss"],"godapp":raw["configs"]["godapp_task2"]["201"]},"facts":facts})
}
fn soul_rolls(s:&Value,c:&Value)->Option<Value>{
    let init=&c["equip_init"][key(&s["itemId"])];let config=&c["equip_attr"][key(&init["rand_id"])];
    let range=config["rang_rand"].as_array()?;let low=range.first()?.as_f64()?;let high=range.get(1)?.as_f64()?;
    if low<0.0||high<=low{return None;}
    let rows=s["rattr"].as_array()?;let mut attributes=BTreeMap::<String,Value>::new();
    for row in rows{
        let raw=row[0].as_str()?;let(name,factor)=attr(raw).ok()?;let ratio=row[1].as_f64()?;
        if ratio<low-1e-9||ratio>high+1e-9{return None;}
        let base=config["attr_list"].as_array()?.iter().find(|r|r[0].as_str()==Some(raw))?[1].as_f64()?*factor;
        let entry=attributes.entry(name.into()).or_insert_with(||json!({"hands":0,"base":base,"low":low,"high":high}));entry["hands"]=json!(entry["hands"].as_u64()?+1);
    }
    let initial=rows.len().checked_sub(s["level"].as_u64()? as usize/3).filter(|n|(2..=4).contains(n));
    let focused=initial.map(|n|{let upgrades=&rows[n..];!upgrades.is_empty()&&upgrades.iter().all(|row|row[0]==upgrades[0][0])});
    Some(json!({"initial":initial,"focused":focused,"attributes":attributes}))
}
fn shard(id:&str,name:&str,book:&Value,raw:&Value)->ShardRecord{
    let normal=count(&raw["currency"][key(&book[1])]);
    let bound=raw["boundShards"].as_object().map(|rows|count(rows.get(&key(&book[1])).unwrap_or(&Value::Null)));
    ShardRecord{id:id.into(),name:name.into(),quantity:normal.saturating_add(bound.unwrap_or(0)),normal:Some(normal),bound,contracts:Some(count(&raw["currency"][key(&book[0])])),target:book[2].as_u64().and_then(|n|u32::try_from(n).ok())}
}
fn hero_stories(raw:&Value)->Value{
    let configs=&raw["configs"];let mut result=serde_json::Map::new();
    for(id,hero)in configs["hero"].as_object().into_iter().flatten(){
        if !matches!(hero["type"].as_u64(),Some(1|2)){continue;}
        let tasks:Vec<_>=hero["story"].as_array().into_iter().flatten().flat_map(|story|configs["awakestory_cn"][key(story)]["activityId"].as_array().cloned().unwrap_or_default()).map(|task|{
            let id=key(&task);let config=&configs["achieve_job"][&id];let progress=&raw["job_list"][&id];
            json!({"id":id,"description":config["content"],"current":progress["cond"].as_f64(),"target":config["cond_val"],"rewards":config["reward"]})
        }).collect();
        if !tasks.is_empty(){result.insert(id.clone(),json!(tasks));}
    }
    Value::Object(result)
}
fn hero_materials(raw:&Value)->Value{
    let Some(bag)=raw["heroes_bag"].as_object()else{return Value::Null;};
    let mut counts:BTreeMap<String,u64>=BTreeMap::new();
    for(key,value)in bag{let Some(amount)=value.as_u64()else{continue;};let Some(template)=key.split('_').next().filter(|s|!s.is_empty()&&s.chars().all(|c|c.is_ascii_digit()))else{continue;};*counts.entry(template.to_owned()).or_default()+=amount;}
    let rows:Vec<_>=counts.into_iter().filter(|(_,count)|*count>0).map(|(id,count)|json!({"templateId":id,"name":raw["configs"]["hero"][&id]["name"].as_str().unwrap_or("未识别素材"),"count":count})).collect();
    json!({"total":rows.iter().filter_map(|r|r["count"].as_u64()).sum::<u64>(),"rows":rows})
}
pub fn attr(raw:&str)->Result<(&'static str,f64)>{Ok(match raw{
    "attackAdditionVal"|"baseAttack"=>("attack",1.0),"maxHpAdditionVal"|"baseMaxHp"=>("hp",1.0),"defenseAdditionVal"|"baseDefense"=>("defense",1.0),
    "attackAdditionRate"=>("attack_pct",100.0),"maxHpAdditionRate"=>("hp_pct",100.0),"defenseAdditionRate"=>("defense_pct",100.0),
    "speedAdditionVal"|"baseSpeed"=>("speed",1.0),"critRateAdditionVal"|"baseCritRate"=>("crit",100.0),
    "critPowerAdditionVal"|"baseCritPower"=>("crit_damage",100.0),"debuffEnhance"=>("hit",100.0),"debuffResist"=>("resist",100.0),
    _=>return Err(format!("尚未适配游戏属性 {raw}")),
})}
pub(crate) fn soul(id:&str,s:&Value,c:&Value)->Result<Soul>{
    let init=&c["equip_init"][key(&s["itemId"])];
    let index=s["base_rindex"].as_u64().ok_or("御魂缺少主属性序号")? as usize;
    let raw=init["base_attr"][index][0].as_str().ok_or("御魂主属性配置缺失")?;
    let (main,factor)=attr(raw)?;let quality=integer(&s["qua"]);let level=integer(&s["level"]);
    if !(1..=6).contains(&quality){return Err("御魂星级无效".into());}
    let base=init["base_attr_v"][index].as_f64().ok_or("御魂主属性初值缺失")?;
    let upgrade=if level==0{0.0}else{c["equip_upgrade"][level.to_string()]["attr_list"][raw][quality as usize-1].as_f64().ok_or("御魂强化主属性配置缺失")?};
    let rolls=c["equip_attr"][key(&init["rand_id"])]["attr_list"].as_array().ok_or("御魂副属性配置缺失")?;
    let mut sub=Stats::new();
    for row in s["rattr"].as_array().ok_or("御魂副属性结构缺失")?{
        let name=row[0].as_str().ok_or("御魂副属性名称缺失")?;let(a,mul)=attr(name)?;
        let max=rolls.iter().find(|r|r[0].as_str()==Some(name)).and_then(|r|r[1].as_f64()).ok_or("御魂副属性换算参数缺失")?;
        let ratio=row[1].as_f64().ok_or("御魂副属性系数无效")?;
        *sub.entry(a.into()).or_insert(0.0)+=ratio*max*mul;
    }
    let set=c["equip_suit"][key(&s["suitid"])]["suit_n"].as_str().ok_or("御魂套装配置缺失")?;
    let mut innate=Stats::new();
    if let Some(kind)=s["single_attr"].as_u64().filter(|k|*k!=0){let(a,value)=match kind{1=>("attack_pct",8.0),2=>("hp_pct",8.0),3=>("defense_pct",16.0),4=>("crit",8.0),5=>("hit",8.0),6=>("resist",8.0),_=>return Err("首领御魂独有属性尚未适配".into())};innate.insert(a.into(),value);}
    Ok(Soul{id:id.into(),set:set.into(),slot:integer(&init["equipType"]).checked_sub(10).ok_or("御魂号位无效")?,quality,level,main:main.into(),value:(base+upgrade)*factor,sub,innate,locked:yes(&s["lock"]),equipped:String::new(),initial_substats:None})
}

pub(crate) fn hero_stats(t:&Value,level:u8,star:u8,awake:bool,cached:&Value)->(Stats,Stats){
    let mut base=crate::game_growth::base(t,level,star,awake).unwrap_or_default();
        for(raw_name,awake_name)in [("baseSpeed","awakeIncBaseSpeed"),("baseCritRate","awakeIncBaseCritRate"),("baseCritPower","awakeIncBaseCritPower"),("debuffEnhance","")]{
            let(a,mul)=attr(raw_name).expect("known base attribute");
            if t[raw_name].is_number(){base.insert(a.into(),(n(&t[raw_name])+if awake{n(&t[awake_name])}else{0.0})*mul+if a=="crit_damage"{100.0}else{0.0});}
        }
        // Only use verified cached base fields, never substitute invented stats.
        for(raw_name,a)in [("baseAttack","attack"),("baseMaxHp","hp"),("baseDefense","defense")]{if let Some(v)=cached[raw_name].as_f64(){base.insert(a.into(),v);}}
    let mut bonus=Stats::new();if awake{if let Some(name)=t["awakeAttr"][0].as_str(){if let Ok((a,mul))=attr(name){bonus.insert(a.into(),n(&t["awakeAttr"][1])*mul);}}}
    (base,bonus)
}

pub fn convert(raw:&Value)->Result<(Document,Vec<String>)>{
    let c=&raw["configs"];let inventory=raw["inventory"].as_object().ok_or("未读取到御魂库存")?;
    let heroes=raw["heroes"].as_object().ok_or("未读取到式神库存")?;
    let mut doc=Document{name:raw["player"]["_name"].as_str().filter(|s|!s.trim().is_empty()).unwrap_or("游戏角色").into(),..Document::default()};
    let mut warnings=vec![];let mut owners=HashMap::new();let mut shard_ids=HashSet::new();let mut missing_base=0;
    if let Some(templates)=c["hero"].as_object(){for(id,t)in templates{
        let Some(template_id)=id.parse::<u32>().ok().filter(|id|(200..1000).contains(id))else{continue;};
        let book=&t["book"];if book.as_array().is_none_or(|b|b.len()<2){continue;}
        if book[0].as_u64()!=Some(420001+u64::from(template_id)*10){continue;}
        let name=t["name"].as_str().unwrap_or("未知式神");
        shard_ids.insert(id.clone());doc.shards.push(shard(id,name,book,raw));
    }}
    for(id,h)in heroes{
        if matches!(h["_heroTempData"]["type"].as_u64(),Some(4|9)){continue;}
        if let Some(equips)=h["_equips"].as_array(){for eid in equips{if let Some(eid)=eid.as_str(){if owners.insert(eid.to_owned(),id.clone()).is_some(){return Err("同一枚御魂出现多个装备归属，请重新读取".into());}}}}
        let t=&h["_heroTempData"];let awake=yes(&h["_awake"]);let(base,bonus)=hero_stats(t,integer(&h["_level"]),integer(&h["_star"]),awake,&h["all_attrs"]);
        if ["attack","hp","defense"].iter().any(|a|!base.contains_key(*a)){missing_base+=1;}
        let name=h["_name"].as_str().unwrap_or("未知式神").to_owned();
        doc.heroes.push(Hero{id:id.clone(),name:name.clone(),rarity:match t["rarity"].as_u64(){Some(1)=>"N",Some(2)=>"R",Some(3)=>"SR",Some(4)=>"SSR",Some(5)=>"SP",Some(6)=>"UR",_=>"MATERIAL"}.into(),level:integer(&h["_level"]),star:integer(&h["_star"]),awakened:awake,shards:0,base,bonus});
        let hero_id=key(&h["heroId"]);
        if shard_ids.insert(hero_id.clone()){
            let book=&t["book"];if book.as_array().is_some_and(|b|b.len()>=2){
                doc.shards.push(shard(&hero_id,&name,book,raw));
            }
        }
    }
    for(id,s)in inventory{let mut s=soul(id,s,c).map_err(|e|format!("御魂 {id}：{e}"))?;s.equipped=owners.get(id).cloned().unwrap_or_default();doc.souls.push(s);}
    doc.sets=c["equip_suit"].as_object().into_iter().flat_map(|sets|sets.values()).filter_map(set_definition).collect();
    if let Some(currency)=raw["currency"].as_object(){for(id,amount)in currency{let amount=n(amount);if amount<=0.0{continue;}
        let name=c["currency"][id]["name"].as_str().filter(|s|!s.is_empty()).unwrap_or("未知物品");
        doc.resources.push(Resource{name:format!("{name} · #{id}"),amount,unit:"份".into()});
    }}
    // Progress is retained verbatim until task goals/reward state are verified.
    let mut extras=BTreeMap::new();
    for name in ["player","reader","daily_task","daily_task_event","daily_task_reward","taskInfo","plotDupInfo","heroTeamPrefabs","heroTeamPrefabGroup","soulCards","lbscards","lbscards_bag","guild_info","daily_task_timestamp","daily_task_act_recved","new_daily_task_act_recv","lbs_room","friend_lbs_card_time","friend_lbs_card_lock_time","guild_week_feats","history_guild_donate","boundShards","lockedShards"]{extras.insert(name,raw[name].clone());}
    extras.insert("routineProgress",raw["routineProgress"].clone());
    extras.insert("hunling_logic",raw["hunling_logic"].clone());
    let hero_details:BTreeMap<_,_>=heroes.iter().map(|(id,h)|(id,json!({"templateId":h["heroId"],"skills":h["skillList"],"locked":h["lock"]}))).collect();
    let tasks=task_snapshot(raw);
    let soul_set_ids:BTreeMap<_,_>=c["equip_suit"].as_object().into_iter().flatten().filter_map(|(id,row)|row["suit_n"].as_str().map(|name|(name,id))).collect();
    let soul_growth:BTreeMap<_,_>=inventory.iter().filter_map(|(id,s)|soul_rolls(s,c).map(|rolls|(id,rolls))).collect();
    let resource_details:BTreeMap<_,_>=c["currency"].as_object().into_iter().flatten().filter(|(id,_)|raw["currency"].get(*id).is_some()).map(|(id,row)|(id,json!({"type":row["type"],"description":row["desc"],"icon":row["normal_icon"]}))).collect();
    doc.extras=json!({"capture":extras,"heroDetails":hero_details,"heroStories":hero_stories(raw),"heroMaterials":hero_materials(raw),"resourceDetails":resource_details,"soulSetIds":soul_set_ids,"soulGrowth":soul_growth,"taskSnapshot":tasks,"taskFacts":tasks["facts"],"realmInventory":crate::realm::inventory(raw),"realmStatus":crate::realm::status(raw),"guildSnapshot":crate::realm::guild(raw),"scrollSnapshot":crate::scroll::snapshot(raw)});
    if missing_base>0{warnings.push(format!("{missing_base} 条式神或培养素材记录的等级组合尚未校准，攻击、生命或防御基础值需手动补齐；其余记录已应用已验证的成长参数。"));}
    warnings.push("已保存当前已载入的角色库存和任务进度；未载入的寮成员名单不会推测生成。任务进度是读取时的游戏事实，手动待办另行保存。".into());
    validate(&doc)?;Ok((doc,warnings))
}

#[cfg(test)]mod tests{
    #[test]fn all_eight_game_six_piece_bonuses_are_decoded_as_fixed_attributes(){
        let equipment:Value=serde_json::from_str(include_str!("../data/equipment.json")).unwrap();
        for(id,name,attribute,value)in [("300100","村正","attack_pct",75.0),("300101","要石","defense_pct",120.0),("300102","御神木","hp_pct",75.0),("300103","见切斩","crit",75.0),("300104","罗刹","crit_damage",60.0),("300105","神足","speed",50.0),("300106","见谛道","hit",90.0),("300107","空蝉","resist",90.0)]{
            let set=set_definition(&equipment["equip_suit"][id]).unwrap();assert_eq!(set.name,name);assert!(set.two_piece.is_empty());assert_eq!(set.six_piece.len(),1);assert!((set.six_piece[attribute]-value).abs()<1e-9);
        }
        let old=set_definition(&equipment["equip_suit"]["300032"]).unwrap();assert!(old.six_piece.is_empty());
    }
    use super::*;
    #[test]fn contract_spirit_instances_and_unknown_capture_survive_conversion(){
        let raw=json!({"inventory":{},"heroes":{},"hunling_logic":{"souls":{"own-a":{"id":100,"lv":0,"star":6,"marks":[5,5,8],"lock":false}},"yys_hunling":{"10":"own-a"}}});
        let(doc,_)=convert(&raw).unwrap();assert_eq!(doc.extras["capture"]["hunling_logic"],raw["hunling_logic"]);
        let unknown=json!({"inventory":{},"heroes":{}});let(doc,_)=convert(&unknown).unwrap();assert!(doc.extras["capture"]["hunling_logic"].is_null());
    }
    #[test]fn inventory_floats_keep_their_bits_when_saved_and_reloaded(){
        for value in [10.996953180786505_f64,10.286906366200487_f64,102.39291415128915_f64]{let encoded=serde_json::to_string(&value).unwrap();let decoded:f64=serde_json::from_str(&encoded).unwrap();assert_eq!(decoded.to_bits(),value.to_bits());}
    }
    #[test]fn task_snapshot_preserves_unknown_targets_and_live_schedule(){
        let raw=json!({"reader":{"capturedAt":"2026-10-27T12:00:00Z"},"daily_task_timestamp":1793030400,"daily_task":{"known":{"cur_times":2},"unknown":{"cur_times":1}},"routineProgress":{"guild_beg_times":1},"configs":{"daily_task":{"known":{"a_ui_title":"测试任务","max_times":2}},"active_time":{"guild_boss":{"open_week_day":[5]}},"godapp_task2":{"201":{"condition":1}}}});
        let result=task_snapshot(&raw);assert_eq!(result["rules"]["retreat"]["open_week_day"],json!([5]));assert_eq!(result["routines"]["guild_beg_times"],1);
        let rows=result["facts"].as_array().unwrap();let known=rows.iter().find(|r|r["id"]=="known").unwrap();assert_eq!(known["completed"],true);let unknown=rows.iter().find(|r|r["id"]=="unknown").unwrap();assert!(unknown["completed"].is_null());assert!(unknown["target"].is_null());
    }
    #[test]fn aggregate_materials_are_counted_without_fabricating_instances(){
        let raw=json!({"heroes_bag":{"410_2_1_0":8,"410_3_20_0":2,"412_2_1_0":3,"200_2_1_0":0},"configs":{"hero":{"410":{"name":"招福达摩"},"412":{"name":"奉为达摩"}}}});
        let materials=hero_materials(&raw);assert_eq!(materials["total"],13);assert_eq!(materials["rows"].as_array().unwrap().len(),2);assert_eq!(materials["rows"][0]["count"],10);
        assert!(hero_materials(&json!({})).is_null());assert_eq!(hero_materials(&json!({"heroes_bag":{}}))["total"],0);
    }
    #[test]fn shard_contracts_are_not_fragments_and_bound_counts_are_separate(){
        let raw=json!({"currency":{"420001":2,"430001":3},"boundShards":{"430001":4}});
        let result=shard("test","测试式神",&json!([420001,430001,50]),&raw);
        assert_eq!(result.quantity,7);assert_eq!(result.normal,Some(3));assert_eq!(result.bound,Some(4));assert_eq!(result.contracts,Some(2));assert_eq!(result.target,Some(50));
        let unknown=shard("test","测试式神",&json!([420001,430001,50]),&json!({"currency":{"430001":3}}));assert_eq!(unknown.bound,None);assert_eq!(unknown.quantity,3);
        assert_eq!(shard("test","测试式神",&json!([420001,430001,50]),&json!({"currency":{},"boundShards":{}})).bound,Some(0));
    }
    #[test]fn game_characters_and_summons_do_not_become_owned_shikigami(){
        let raw=json!({"inventory":{},"configs":{},"heroes":{"one":{"_name":"低稀有度式神","_heroTempData":{"type":1}},"two":{"_name":"高稀有度式神","_heroTempData":{"type":2}},"guard":{"_name":"召唤物","_heroTempData":{"type":4}},"player":{"_name":"阴阳师","_heroTempData":{"type":9}}}});
        let(doc,_)=convert(&raw).unwrap();assert_eq!(doc.heroes.len(),2);assert!(doc.heroes.iter().all(|h|["one","two"].contains(&h.id.as_str())));
    }
    #[test]fn own_config_conversion_checks_main_sub_and_percent_units(){
        let c=json!({"equip_init":{"120006":{"base_attr":[["speedAdditionVal",1]],"base_attr_v":[12],"equipType":12,"rand_id":6}},"equip_upgrade":{"15":{"attr_list":{"speedAdditionVal":[1,1,1,1,1,45]}}},"equip_attr":{"6":{"attr_list":[["critRateAdditionVal",0.03,1],["attackAdditionVal",27,2]]}},"equip_suit":{"300001":{"suit_n":"测试套装"}}});
        let s=json!({"itemId":120006,"base_rindex":0,"qua":6,"level":15,"suitid":300001,"rattr":[["critRateAdditionVal",1.8],["attackAdditionVal",0.9],["critRateAdditionVal",1.0]],"lock":1});
        let out=soul("fixture",&s,&c).unwrap();assert_eq!(out.slot,2);assert_eq!(out.value,57.0);assert!((out.sub["crit"]-8.4).abs()<1e-8);assert!((out.sub["attack"]-24.3).abs()<1e-8);assert!(out.locked);
        let mut bad=s;bad["base_rindex"]=json!(9);assert!(soul("bad",&bad,&c).is_err());
    }
    #[test]#[ignore="requires an explicit own reader fixture"]fn validate_own_capture(){
        let path=std::env::var("PINGAN_CAPTURE_PATH").unwrap();let raw:Value=serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();let(doc,warnings)=convert(&raw).unwrap();
        assert_eq!(doc.souls.len(),raw["inventory"].as_object().unwrap().len());assert_eq!(doc.heroes.len(),raw["heroes"].as_object().unwrap().values().filter(|h|!matches!(h["_heroTempData"]["type"].as_u64(),Some(4|9))).count());
        if let Ok(path)=std::env::var("PINGAN_CONVERTED_PATH"){std::fs::write(path,serde_json::to_vec(&doc).unwrap()).unwrap();}
        if let Ok(path)=std::env::var("PINGAN_PANELS_PATH"){
            let panels:BTreeMap<_,_>=doc.heroes.iter().map(|h|{let equipped:Vec<_>=doc.souls.iter().filter(|s|s.equipped==h.id).collect();(&h.id,crate::engine::panel_with_bonus(&equipped,&h.base,&h.bonus,&doc.sets))}).collect();
            std::fs::write(path,serde_json::to_vec(&panels).unwrap()).unwrap();
        }
        if std::env::var_os("PINGAN_VERIFY_SPEED").is_some(){let start=std::time::Instant::now();let result=crate::engine::speed_overview(&doc.souls,&doc.sets,true).unwrap();println!("Speed overview: {} sets, {} ms; scatter {}",result["ranked"].as_array().unwrap().len(),start.elapsed().as_millis(),result["scatter"]["objective"]);if let Ok(path)=std::env::var("PINGAN_SPEED_PATH"){std::fs::write(path,serde_json::to_vec(&result).unwrap()).unwrap();}}
        println!("Converted {} souls, {} heroes, {} resources, {} shard records; {} notices",doc.souls.len(),doc.heroes.len(),doc.resources.len(),doc.shards.len(),warnings.len());
    }
}
