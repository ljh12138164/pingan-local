use crate::model::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub fn score(soul: &Soul, rule: &Rule) -> f64 {
    soul.sub.iter().map(|(k,v)| v / roll_size(k) * rule.weights.get(k).copied().unwrap_or(0.0)).sum::<f64>()
}

pub fn add(target: &mut Stats, stats: &Stats) { for (k,v) in stats { *target.entry(k.clone()).or_default() += v; } }

pub fn panel(souls: &[&Soul], base: &Stats, sets: &[SetDef]) -> Stats {
    panel_with_bonus(souls,base,&Stats::new(),sets)
}
pub fn panel_with_bonus(souls: &[&Soul], base: &Stats, bonus:&Stats,sets: &[SetDef]) -> Stats {
    let mut extra = bonus.clone();
    let mut counts = BTreeMap::<&str, usize>::new();
    for soul in souls { add(&mut extra, &soul.sub); add(&mut extra,&soul.innate); *extra.entry(soul.main.clone()).or_default() += soul.value; *counts.entry(&soul.set).or_default() += 1; }
    for def in sets { let count=counts.get(def.name.as_str()).copied().unwrap_or(0);if count>=2{add(&mut extra,&def.two_piece);}if count>=6{add(&mut extra,&def.two_piece);add(&mut extra,&def.six_piece);} }
    let mut result = Stats::new();
    for attr in ["attack", "hp", "defense"] {
        let value = base.get(attr).copied().unwrap_or(0.0) * (1.0 + extra.get(&format!("{attr}_pct")).copied().unwrap_or(0.0) / 100.0) + extra.get(attr).copied().unwrap_or(0.0);
        result.insert(attr.into(), value);
    }
    for attr in ["speed", "crit", "crit_damage", "hit", "resist"] { result.insert(attr.into(), base.get(attr).copied().unwrap_or(0.0) + extra.get(attr).copied().unwrap_or(0.0)); }
    let attack = result["attack"];
    let crit = result["crit"].clamp(0.0,100.0) / 100.0;
    let cd = result["crit_damage"] / 100.0;
    result.insert("damage".into(), attack * (1.0 + crit * (cd - 1.0)));
    result
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    #[serde(default)] pub association: Option<crate::association::Plan>,
    pub base: Stats,
    #[serde(default)] pub bonus: Stats,
    pub metric: String,
    #[serde(default)] pub minimums: Stats,
    #[serde(default)] pub maximums: Stats,
    #[serde(default)] pub target: Option<f64>,
    #[serde(default)] pub set_pieces: BTreeMap<String, usize>,
    #[serde(default)] pub main_options: BTreeMap<String, Vec<String>>,
    #[serde(default)] pub only_six: bool,
    #[serde(default)] pub exclude_three: bool,
    #[serde(default)] pub four_set: String,
    #[serde(default)] pub two_set: String,
    #[serde(default)] pub main_filters: BTreeMap<String, String>,
    #[serde(default)] pub only_max: bool,
    #[serde(default)] pub exclude_equipped: bool,
    #[serde(default)] pub include_locked: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Combination { pub ids: Vec<String>, pub panel: Stats, pub objective: f64, pub satisfied: bool, pub deficits: Stats, pub sets: BTreeMap<String, usize>, #[serde(skip_serializing_if="Option::is_none")]pub association_score:Option<f64> }

fn combination(souls: &[&Soul], sets: &[SetDef], req: &SearchRequest) -> Combination {
    let p = panel_with_bonus(souls, &req.base, &req.bonus, sets);
    let mut counts = BTreeMap::new();
    for s in souls { *counts.entry(s.set.clone()).or_default() += 1; }
    let mut deficits = Stats::new();
    for (k,min) in &req.minimums { let d = min - p.get(k).copied().unwrap_or(0.0); if d > 0.00001 { deficits.insert(k.clone(), d); } }
    for (k,max) in &req.maximums { let d = p.get(k).copied().unwrap_or(0.0) - max; if d > 0.00001 { deficits.insert(format!("max:{k}"), d); } }
    let objective = objective(&p, &req.metric);
    if let Some(target) = req.target { if target - objective > 0.00001 { deficits.insert("target".into(), target-objective); } }
    for (name,need) in &req.set_pieces { let count=counts.get(name).copied().unwrap_or(0);if count<*need{deficits.insert(format!("set:{name}"), (need-count) as f64);} }
    if !req.four_set.is_empty() && counts.get(&req.four_set).copied().unwrap_or(0) < 4 { deficits.insert("fourSet".into(), (4 - counts.get(&req.four_set).copied().unwrap_or(0)) as f64); }
    if !req.two_set.is_empty() {
        let required = if req.two_set == req.four_set { 6 } else { 2 };
        if counts.get(&req.two_set).copied().unwrap_or(0) < required { deficits.insert("twoSet".into(), (required - counts.get(&req.two_set).copied().unwrap_or(0)) as f64); }
    }
    let association_score=None;
    Combination { ids: souls.iter().map(|s|s.id.clone()).collect(), objective, panel:p, satisfied:deficits.is_empty(), deficits, sets:counts, association_score }
}

fn objective(panel:&Stats,metric:&str)->f64 {
    let value=|key:&str|panel.get(key).copied().unwrap_or(0.0);
    match metric {
        "crit_output" => value("attack")*value("crit_damage")/100.0,
        "healing" => value("hp")*value("crit_damage")/100.0,
        "defense_output" => value("defense")*value("crit_damage")/100.0,
        "hit_resist" => value("hit")*value("resist")/10000.0,
        _ => value(metric),
    }
}

fn rank_cmp(a:&Combination,b:&Combination)->std::cmp::Ordering{
    a.satisfied.cmp(&b.satisfied).then_with(||{
        if a.satisfied{return std::cmp::Ordering::Equal;}
        let deficit=|c:&Combination|c.deficits.iter().map(|(k,v)|v/roll_size(k.strip_prefix("max:").unwrap_or(k))).sum::<f64>();deficit(b).total_cmp(&deficit(a))
    }).then_with(||a.objective.total_cmp(&b.objective))
}

pub fn optimize(souls: &[Soul], sets: &[SetDef], req: &SearchRequest) -> Result<serde_json::Value, String> {
    if let Some(plan)=&req.association{crate::association::validate(plan)?;}
    check_stats(&req.base)?;
    check_stats(&req.bonus)?;
    check_stats(&req.minimums)?;
    check_stats(&req.maximums)?;
    if req.maximums.iter().any(|(k,max)|req.minimums.get(k).is_some_and(|min|min>max)){return Err("属性最低值不能大于最高值".into());}
    if req.target.is_some_and(|v|!v.is_finite()||v<0.0||v>1e18){return Err("目标值必须是非负有限数，且不超过 10¹⁸".into());}
    if !["speed","damage","attack","hp","defense","crit","crit_damage","hit","resist","crit_output","healing","defense_output","hit_resist"].contains(&req.metric.as_str()) { return Err("不支持的计算目标".into()); }
    if req.main_options.iter().any(|(slot,values)|!["2","4","6"].contains(&slot.as_str())||values.iter().any(|v|!ATTRS.contains(&v.as_str()))){return Err("号位主属性筛选无效".into());}
    let mut requirements=req.set_pieces.clone();
    if requirements.iter().any(|(name,count)|name.trim().is_empty()||*count==0||*count>6){return Err("套装名称不能为空，件数应为 1–6".into());}
    if !req.four_set.is_empty(){let count=requirements.entry(req.four_set.clone()).or_default();*count=(*count).max(4);}
    if !req.two_set.is_empty(){let count=requirements.entry(req.two_set.clone()).or_default();*count=(*count).max(if req.two_set==req.four_set{6}else{2});}
    if requirements.values().sum::<usize>()>6{return Err("套装所需件数合计不能超过六件".into());}
    let slots: Vec<Vec<&Soul>> = (1..=6).map(|slot| souls.iter().filter(|s|s.slot == slot && (!req.only_max || s.level == 15) && (!req.only_six || s.quality==6) && (!req.exclude_three||s.initial_substats!=Some(3)) && (!req.exclude_equipped || s.equipped.is_empty()) && (req.include_locked || !s.locked) && req.main_filters.get(&slot.to_string()).is_none_or(|m|m.is_empty() || s.main == *m) && req.main_options.get(&slot.to_string()).is_none_or(|values|values.is_empty()||values.contains(&s.main))).collect()).collect();
    if slots.iter().any(Vec::is_empty) { return Err(format!("号位 {} 没有符合筛选条件的御魂", slots.iter().position(Vec::is_empty).unwrap() + 1)); }
    let total = slots.iter().fold(1u64, |a,b|a.saturating_mul(b.len() as u64));
    let speed_sets:Vec<_>=sets.iter().filter(|s|s.two_piece.get("speed").copied().unwrap_or(0.0)!=0.0||s.six_piece.get("speed").copied().unwrap_or(0.0)!=0.0).filter(|def|slots.iter().flatten().any(|s|s.set==def.name)).collect();
    // The current game has one fixed-speed set. Track its exact piece count;
    // multiple custom speed sets use the existing bounded/exhaustive paths.
    let additive_speed = req.metric=="speed" && req.maximums.is_empty() && req.minimums.iter().all(|(k,v)|k=="speed"||*v==0.0) && speed_sets.len()<=1;
    let exact = total <= 300_000 || additive_speed;
    let mut checked = 0usize;
    let mut results = Vec::<Combination>::new();
    if additive_speed {
        // For a fixed set-count state, future slots add the same possible
        // contributions. Keeping its best 12 prefixes preserves the top 12.
        let required:Vec<_>=requirements.iter().collect();
        let mut states:BTreeMap<Vec<usize>,Vec<(f64,Vec<&Soul>)>>=BTreeMap::from([(vec![0;required.len()+1],vec![(0.0,vec![])])]);
        for candidates in &slots{
            let mut next:BTreeMap<Vec<usize>,Vec<(f64,Vec<&Soul>)>>=BTreeMap::new();
            for(counts,prefixes)in states{for soul in candidates{
                let mut state:Vec<_>=required.iter().enumerate().map(|(i,(name,need))|(counts[i]+usize::from(soul.set==**name)).min(**need)).collect();
                state.push(counts[required.len()]+usize::from(speed_sets.first().is_some_and(|def|soul.set==def.name)));
                let gain=soul.sub.get("speed").copied().unwrap_or(0.0)+soul.innate.get("speed").copied().unwrap_or(0.0)+if soul.main=="speed"{soul.value}else{0.0};
                let bucket=next.entry(state).or_default();
                for(value,prefix)in &prefixes{let mut chosen=prefix.clone();chosen.push(*soul);bucket.push((value+gain,chosen));}
                bucket.sort_by(|a,b|b.0.total_cmp(&a.0));bucket.truncate(12);
            }}
            states=next;
        }
        for prefixes in states.into_values(){for(_,chosen)in prefixes{checked+=1;results.push(combination(&chosen,sets,req));}}
    } else if exact {
        fn walk<'a>(at: usize, slots: &[Vec<&'a Soul>], chosen: &mut Vec<&'a Soul>, sets: &[SetDef], req: &SearchRequest, results: &mut Vec<Combination>, checked: &mut usize) {
            if at == 6 { *checked += 1; results.push(combination(chosen,sets,req)); if results.len() >= 100 { results.sort_by(|a,b|rank_cmp(b,a)); results.truncate(12); } return; }
            for soul in &slots[at] { chosen.push(soul); walk(at+1,slots,chosen,sets,req,results,checked); chosen.pop(); }
        }
        walk(0,&slots,&mut Vec::new(),sets,req,&mut results,&mut checked);
    } else {
        // A bounded beam keeps the UI responsive; the response explicitly labels it approximate.
        let mut beam: Vec<Vec<&Soul>> = vec![vec![]];
        for candidates in &slots {
            let mut bounded=candidates.clone();
            bounded.sort_by(|a,b| {
                let value=|s:&&Soul| { let p=panel_with_bonus(&[*s],&req.base,&req.bonus,sets);objective(&p,&req.metric)+req.minimums.iter().map(|(k,min)|p.get(k).copied().unwrap_or(0.0)/min.max(1.0)*10000.0).sum::<f64>()-req.maximums.iter().map(|(k,max)|(p.get(k).copied().unwrap_or(0.0)-max).max(0.0)/max.max(1.0)*10000.0).sum::<f64>()+if requirements.contains_key(&s.set){100000.0}else{0.0} };
                value(b).total_cmp(&value(a))
            });
            bounded.truncate(48);
            let mut next = Vec::new();
            for prev in &beam { for soul in &bounded { let mut c = prev.clone(); c.push(soul); let p = panel_with_bonus(&c,&req.base,&req.bonus,sets); let mut merit = objective(&p,&req.metric);
                for (k,min) in &req.minimums { merit += (p.get(k).copied().unwrap_or(0.0) / min.max(1.0)).min(1.0) * 10000.0; }
                for (name,need) in &requirements { merit+=c.iter().filter(|s|s.set==*name).count().min(*need) as f64*20000.0; }
                for (k,max) in &req.maximums { merit-=(p.get(k).copied().unwrap_or(0.0)-max).max(0.0)/max.max(1.0)*10000.0; }
                next.push((merit,c));
            } }
            next.sort_by(|a,b|b.0.total_cmp(&a.0));
            next.truncate(256);
            beam=next.into_iter().map(|(_,c)|c).collect();
        }
        for c in beam { checked+=1; results.push(combination(&c,sets,req)); }
    }
    results.sort_by(|a,b|rank_cmp(b,a));
    results.truncate(12);
    if let Some(plan)=&req.association{for row in &mut results{let chosen:Vec<_>=row.ids.iter().filter_map(|id|souls.iter().find(|s|s.id==*id)).collect();row.association_score=Some(crate::association::combination_score(&chosen,sets,plan,&req.metric,&req.base,&req.minimums));}}
    let metric_formula=match req.metric.as_str(){"crit_output"=>"攻击 × 暴伤 / 100（假设本次暴击）","healing"=>"生命 × 暴伤 / 100（治疗面板指标）","defense_output"=>"防御 × 暴伤 / 100（防御输出面板指标）","hit_resist"=>"效果命中 / 100 × 效果抵抗 / 100","damage"=>"攻击 × [1 + min(暴击,100)/100 × (暴伤/100 − 1)]（暴击期望）",_=>"所选面板属性"};
    Ok(serde_json::json!({"results":results,"exact":exact,"combinations":total.to_string(),"checked":checked,"method":if additive_speed{"按套装件数进行动态规划，精确保留最快的 12 个组合"}else if exact {"穷举全部符合筛选条件的组合"} else {"每号位最多保留 48 个启发式候选，256 宽度束搜索；结果为近似解，不保证全局最优或找到所有可行解"},"formula":format!("当前指标：{metric_formula}。攻击 / 生命 / 防御 = 基础值 × (1 + 对应加成 / 100) + 固定值；计入觉醒附加、额外属性、首领独有及已配置的两件套与六件套固定属性。不计四件套触发、技能、敌方防御及战斗增益。排除三条初始副属性仅作用于已知记录，未知不作猜测。")}))
}

pub fn speed_overview(souls:&[Soul],sets:&[SetDef],only_max:bool)->Result<serde_json::Value,String>{
    let candidates:Vec<_>=souls.iter().filter(|s|!only_max||s.level==15).cloned().collect();
    let req=SearchRequest{metric:"speed".into(),only_max,include_locked:true,..SearchRequest::default()};
    let scatter=optimize(&candidates,sets,&req)?;
    let mut ranked=vec![];
    for name in candidates.iter().map(|s|&s.set).collect::<std::collections::BTreeSet<_>>(){let mut query=req.clone();query.four_set=name.clone();let pieces=if sets.iter().any(|s|s.name==*name&&!s.six_piece.is_empty()){query.two_set=name.clone();6}else{4};let result=optimize(&candidates,sets,&query)?;if let Some(best)=result["results"].as_array().and_then(|r|r.first()).filter(|b|b["satisfied"]==true){ranked.push(serde_json::json!({"set":name,"pieces":pieces,"speed":best["objective"],"ids":best["ids"],"exact":result["exact"]}));}}
    ranked.sort_by(|a,b|b["speed"].as_f64().unwrap().total_cmp(&a["speed"].as_f64().unwrap()));
    let slots:Vec<_>=(1..=6).map(|slot|{let mut rows:Vec<_>=candidates.iter().filter(|s|s.slot==slot).map(|s|serde_json::json!({"id":s.id,"set":s.set,"speed":s.sub.get("speed").copied().unwrap_or(0.0)+s.innate.get("speed").copied().unwrap_or(0.0)+if s.main=="speed"{s.value}else{0.0}})).collect();rows.sort_by(|a,b|b["speed"].as_f64().unwrap().total_cmp(&a["speed"].as_f64().unwrap()));rows.truncate(15);serde_json::json!({"slot":slot,"rows":rows})}).collect();
    Ok(serde_json::json!({"scatter":scatter["results"][0],"exact":scatter["exact"],"ranked":ranked,"slots":slots,"onlyMax":only_max,"model":"御魂提供的速度总和，不含式神基础速度或战斗加速。套装排名按四件或六件要求搜索完整号位组合；计入已配置的固定套装速度，具体精度随结果标记。"}))
}

pub fn improvements(doc:&Document,hero_id:&str,metric:&str,keep_sets:bool)->Result<serde_json::Value,String>{
    if !["speed","damage","attack","hp","defense","crit","crit_damage","hit","resist"].contains(&metric){return Err("不支持的提升目标".into());}
    let hero=doc.heroes.iter().find(|h|h.id==hero_id).ok_or("未找到该式神")?;
    if ["attack","hp","defense","speed","crit","crit_damage"].iter().any(|k|!hero.base.contains_key(*k)){return Err("该式神基础面板尚未完整校准，请先补齐基础属性".into());}
    let equipped:Vec<_>=doc.souls.iter().filter(|s|s.equipped==hero_id).collect();
    let baseline=panel_with_bonus(&equipped,&hero.base,&hero.bonus,&doc.sets);let mut counts=BTreeMap::<&str,usize>::new();for s in &equipped{*counts.entry(&s.set).or_default()+=1;}
    let mut rows=vec![];
    for soul in doc.souls.iter().filter(|s|s.level==15&&s.equipped!=hero_id){
        let mut next:Vec<_>=equipped.iter().copied().filter(|s|s.slot!=soul.slot).collect();next.push(soul);
        if keep_sets&&counts.iter().any(|(name,n)|{let need=if *n>=6{6}else if *n>=4{4}else if *n>=2{2}else{0};next.iter().filter(|s|s.set==**name).count()<need}){continue;}
        let p=panel_with_bonus(&next,&hero.base,&hero.bonus,&doc.sets);let gain=p[metric]-baseline[metric];
        if gain>1e-7{rows.push(serde_json::json!({"id":soul.id,"slot":soul.slot,"set":soul.set,"equipped":soul.equipped,"gain":gain,"panel":p,"replaces":equipped.iter().find(|s|s.slot==soul.slot).map(|s|&s.id)}));}
    }
    rows.sort_by(|a,b|b["gain"].as_f64().unwrap().total_cmp(&a["gain"].as_f64().unwrap()));let count=rows.len();rows.truncate(100);
    Ok(serde_json::json!({"baseline":baseline,"rows":rows,"count":count,"metric":metric,"model":"逐枚比较库存中的满级御魂替换当前同号位后的面板，只替换一个号位。计入两件套与六件套固定属性、觉醒附加与首领独有属性；不计技能、四件套触发和战斗增益。"}))
}


#[cfg(test)]
mod tests {
    use super::*;
    fn soul(id:&str,slot:u8,spd:f64)->Soul { Soul {id:id.into(),slot,quality:6,level:15,set:"A".into(),main:"attack".into(),value:10.0,sub:[("speed".into(),spd)].into(),..Soul::default()} }
    fn req()->SearchRequest {SearchRequest {base:[("attack".into(),100.0),("crit".into(),50.0),("crit_damage".into(),150.0)].into(),metric:"speed".into(),include_locked:true,..SearchRequest::default()}}
    #[test]fn optimizer_ranges_disable_unbounded_speed_dp_and_find_slower_feasible_result(){
        let mut souls=vec![];for slot in 1..=6{for n in 0..4{souls.push(soul(&format!("{slot}-{n}"),slot,n as f64));}}
        let mut q=req();q.minimums.insert("speed".into(),7.0);q.maximums.insert("speed".into(),8.0);
        let result=optimize(&souls,&[],&q).unwrap();assert_eq!(result["exact"],true);assert_eq!(result["checked"],4096);
        assert_eq!(result["results"][0]["objective"],8.0);assert_eq!(result["results"][0]["satisfied"],true);
        q.maximums.insert("speed".into(),6.0);assert!(optimize(&souls,&[],&q).unwrap_err().contains("最低值"));
        q.minimums.clear();q.maximums.insert("speed".into(),0.0);let result=optimize(&souls,&[],&q).unwrap();assert_eq!(result["results"][0]["objective"],0.0);assert_eq!(result["results"][0]["satisfied"],true);
    }
    #[test]fn multi_main_recipe_and_initial_filters_are_real_search_conditions(){
        let mut souls=vec![];for slot in 1..=6{for name in ["A","B","C"]{let mut s=soul(&format!("{slot}-{name}"),slot,if name=="A"{3.0}else{1.0});s.set=name.into();s.main=if slot==2{"speed"}else{"attack_pct"}.into();s.value=0.0;souls.push(s);}}
        let mut q=req();q.set_pieces=[("A".into(),2),("B".into(),2),("C".into(),2)].into();q.main_options.insert("2".into(),vec!["speed".into(),"hp_pct".into()]);
        let result=optimize(&souls,&[],&q).unwrap();let best=&result["results"][0];assert_eq!(best["satisfied"],true);assert_eq!(best["objective"],10.0);assert_eq!(best["sets"],serde_json::json!({"A":2,"B":2,"C":2}));
        q.set_pieces.insert("A".into(),3);assert!(optimize(&souls,&[],&q).is_err());q.set_pieces.clear();q.main_options.insert("2".into(),vec!["hp_pct".into()]);assert!(optimize(&souls,&[],&q).is_err());
        q.main_options.clear();q.only_six=true;q.exclude_three=true;for s in &mut souls{if s.slot==2{s.quality=5;}}assert!(optimize(&souls,&[],&q).is_err());
        for s in &mut souls{s.quality=6;if s.slot==2{s.initial_substats=Some(3);}}assert!(optimize(&souls,&[],&q).is_err());
        souls[3].initial_substats=None;assert!(optimize(&souls,&[],&q).is_ok());
    }
    #[test]fn combination_metrics_and_target_have_explicit_percentage_units(){
        let p:Stats=[("attack".into(),1000.0),("hp".into(),10000.0),("defense".into(),500.0),("crit_damage".into(),250.0),("hit".into(),80.0),("resist".into(),80.0)].into();
        assert_eq!(objective(&p,"crit_output"),2500.0);assert_eq!(objective(&p,"healing"),25000.0);assert_eq!(objective(&p,"defense_output"),1250.0);assert_eq!(objective(&p,"hit_resist"),0.64);
        let souls:Vec<_>=(1..=6).map(|slot|soul(&slot.to_string(),slot,0.0)).collect();let mut q=req();q.metric="crit_output".into();q.target=Some(241.0);
        let result=optimize(&souls,&[],&q).unwrap();assert_eq!(result["results"][0]["objective"],240.0);assert_eq!(result["results"][0]["satisfied"],false);assert_eq!(result["results"][0]["deficits"]["target"],1.0);
        q.target=Some(240.0);assert_eq!(optimize(&souls,&[],&q).unwrap()["results"][0]["satisfied"],true);
        q.target=Some(f64::NAN);assert!(optimize(&souls,&[],&q).is_err());
    }
    #[test]fn arbitrary_recipe_speed_dp_matches_exhaustive_with_fixed_speed_bonus(){
        let mut souls=vec![];for slot in 1..=6{for (i,name) in ["A","B","C","神足"].iter().enumerate(){let mut s=soul(&format!("{slot}-{i}"),slot,((slot as usize+i)%5) as f64);s.set=(*name).into();souls.push(s);}}
        let sets=[SetDef{name:"神足".into(),six_piece:[("speed".into(),50.0)].into(),..SetDef::default()}];let mut q=req();q.set_pieces=[("A".into(),1),("B".into(),2),("C".into(),1)].into();
        let result=optimize(&souls,&sets,&q).unwrap();let mut expected=vec![];
        for mask in 0..4096{let refs:Vec<_>=(0..6).map(|slot|&souls[slot*4+((mask>>(slot*2))&3)]).collect();let value=combination(&refs,&sets,&q);if value.satisfied{expected.push(value.objective);}}
        expected.sort_by(|a,b|b.total_cmp(a));expected.truncate(12);let actual:Vec<_>=result["results"].as_array().unwrap().iter().map(|r|r["objective"].as_f64().unwrap()).collect();assert_eq!(actual,expected);assert_eq!(result["exact"],true);
    }
    #[test] fn panel_applies_percent_before_flat_and_caps_crit(){ let mut s=soul("x",1,0.0);s.sub=[("attack_pct".into(),50.0),("crit".into(),80.0)].into();let p=panel(&[&s],&req().base,&[]);assert_eq!(p["attack"],160.0);assert_eq!(p["damage"],240.0); }
    #[test]fn six_matching_pieces_repeat_the_two_piece_bonus(){let souls:Vec<_>=(1..=6).map(|i|soul(&format!("s{i}"),i,0.0)).collect();let refs:Vec<_>=souls.iter().collect();let sets=[SetDef{name:"A".into(),two_piece:[("hp_pct".into(),15.0)].into(),..SetDef::default()}];let base=[("hp".into(),10000.0)].into();assert_eq!(panel(&refs[..4],&base,&sets)["hp"],11500.0);assert_eq!(panel(&refs,&base,&sets)["hp"],13000.0);}
    #[test]fn innate_boss_attributes_and_awakening_bonuses_are_separate_from_substats(){let mut s=soul("boss",1,0.0);s.innate=[("attack_pct".into(),8.0)].into();let base=[("attack".into(),1000.0)].into();let bonus=[("attack_pct".into(),10.0),("resist".into(),30.0)].into();let p=panel_with_bonus(&[&s],&base,&bonus,&[]);assert_eq!(p["attack"],1190.0);assert_eq!(p["resist"],30.0);assert_eq!(score(&s,&default_rule()),0.0);}
    #[test] fn exact_search_finds_best_and_respects_sets(){let mut souls:Vec<Soul>=(1..=6).map(|i|soul(&format!("a{i}"),i,1.0)).collect();let mut b=soul("b",2,9.0);b.set="B".into();souls.push(b);let r=optimize(&souls,&[],&req()).unwrap();assert_eq!(r["exact"],true);assert_eq!(r["results"][0]["panel"]["speed"],14.0);let mut q=req();q.four_set="B".into();let r=optimize(&souls,&[],&q).unwrap();assert_eq!(r["results"][0]["satisfied"],false);}
    #[test]fn speed_dynamic_programming_finds_low_ranked_set_pieces_without_candidate_truncation(){
        let mut souls=vec![];for slot in 1..=6{for i in 0..60{let mut s=soul(&format!("{slot}-{i}"),slot,if i==59{0.0}else{100.0});if i==59{s.set="B".into();}souls.push(s);}}
        let mut q=req();q.four_set="B".into();let result=optimize(&souls,&[],&q).unwrap();assert_eq!(result["exact"],true);assert_eq!(result["results"][0]["satisfied"],true);assert_eq!(result["results"][0]["panel"]["speed"],200.0);assert_eq!(result["results"][0]["sets"]["B"],4);
    }
    #[test] fn missing_slot_returns_error(){assert!(optimize(&[soul("a",1,0.0)],&[],&req()).is_err());}
    #[test]fn association_result_is_supplemental_and_matches_final_equipment(){let souls:Vec<_>=(1..=6).map(|slot|soul(&slot.to_string(),slot,2.7)).collect();let mut q=req();let before=optimize(&souls,&[],&q).unwrap();assert!(before["results"][0].get("associationScore").is_none());q.association=Some(crate::association::default_plan());let after=optimize(&souls,&[],&q).unwrap();assert_eq!(before["results"][0]["ids"],after["results"][0]["ids"]);assert_eq!(before["results"][0]["objective"],after["results"][0]["objective"]);assert!((after["results"][0]["associationScore"].as_f64().unwrap()-24.0).abs()<1e-9);}
    #[test]fn fixed_six_piece_bonus_applies_once_and_only_after_six(){
        let souls:Vec<_>=(1..=6).map(|slot|soul(&slot.to_string(),slot,1.0)).collect();let refs:Vec<_>=souls.iter().collect();
        let sets=[SetDef{name:"A".into(),six_piece:[("speed".into(),50.0),("attack_pct".into(),75.0)].into(),..SetDef::default()}];
        let base=[("attack".into(),1000.0)].into();
        assert_eq!(panel(&refs[..5],&base,&sets)["speed"],5.0);
        let all=panel(&refs,&base,&sets);assert_eq!(all["speed"],56.0);assert_eq!(all["attack"],1810.0);
    }
    #[test]fn speed_search_keeps_low_ranked_six_piece_candidates_and_respects_constraints(){
        let mut souls=vec![];for slot in 1..=6{for index in 0..60{let mut s=soul(&format!("{slot}-{index}"),slot,if index==59{1.0}else{5.0});if index==59{s.set="神足".into();}souls.push(s);}}
        let sets=[SetDef{name:"神足".into(),six_piece:[("speed".into(),50.0)].into(),..SetDef::default()}];
        let best=optimize(&souls,&sets,&req()).unwrap();assert_eq!(best["exact"],true);assert_eq!(best["results"][0]["objective"],56.0);assert_eq!(best["results"][0]["sets"]["神足"],6);
        let mut q=req();q.four_set="A".into();let constrained=optimize(&souls,&sets,&q).unwrap();assert_eq!(constrained["results"][0]["objective"],30.0);assert_eq!(constrained["results"][0]["satisfied"],true);
        let ranks=speed_overview(&souls,&sets,true).unwrap();let rank=ranks["ranked"].as_array().unwrap().iter().find(|r|r["set"]=="神足").unwrap();assert_eq!(rank["pieces"],6);assert_eq!(rank["speed"],56.0);
    }
    #[test]fn speed_bonus_dynamic_programming_matches_exhaustive_top_twelve(){
        let mut souls=vec![];for slot in 1..=6{let mut a=soul(&format!("a{slot}"),slot,slot as f64);let b=soul(&format!("b{slot}"),slot,8.0-slot as f64);a.set="神足".into();souls.extend([a,b]);}
        let sets=[SetDef{name:"神足".into(),six_piece:[("speed".into(),50.0)].into(),..SetDef::default()}];
        let result=optimize(&souls,&sets,&req()).unwrap();let mut expected=vec![];
        for mask in 0..64{let refs:Vec<_>=(0..6).map(|slot|&souls[slot*2+((mask>>slot)&1)]).collect();expected.push(panel(&refs,&Stats::new(),&sets)["speed"]);}
        expected.sort_by(|a,b|b.total_cmp(a));expected.truncate(12);
        let actual:Vec<_>=result["results"].as_array().unwrap().iter().map(|r|r["objective"].as_f64().unwrap()).collect();assert_eq!(actual,expected);
    }
    #[test]fn six_piece_stats_round_trip_and_validate(){
        let mut doc=Document{name:"fixed six".into(),sets:vec![SetDef{name:"神足".into(),six_piece:[("speed".into(),50.0)].into(),..SetDef::default()}],..Document::default()};
        let encoded=serde_json::to_value(&doc).unwrap();assert_eq!(encoded["sets"][0]["sixPiece"]["speed"],50.0);assert_eq!(serde_json::from_value::<Document>(encoded).unwrap().sets[0].six_piece["speed"],50.0);
        let old:SetDef=serde_json::from_value(serde_json::json!({"name":"A","twoPiece":{}})).unwrap();assert!(old.six_piece.is_empty());
        let legacy:SetDef=serde_json::from_value(serde_json::json!({"name":"神足","twoPiece":{}})).unwrap();assert_eq!(legacy.six_piece["speed"],50.0);
        let explicit:SetDef=serde_json::from_value(serde_json::json!({"name":"神足","twoPiece":{},"sixPiece":{}})).unwrap();assert!(explicit.six_piece.is_empty());
        let saved=serde_json::to_value(&explicit).unwrap();assert!(serde_json::from_value::<SetDef>(saved).unwrap().six_piece.is_empty());
        doc.sets[0].six_piece.insert("speed".into(),-1.0);assert!(validate(&doc).is_err());
    }
    #[test] fn locked_equipped_and_main_filters_apply(){let souls:Vec<Soul>=(1..=6).map(|i|soul(&format!("a{i}"),i,1.0)).collect();let mut q=req();q.main_filters.insert("2".into(),"speed".into());assert!(optimize(&souls,&[],&q).is_err());}

    #[test] fn invalid_import_is_rejected(){let d=Document{name:"x".into(),souls:vec![soul("a",0,1.0)],..Document::default()};assert!(validate(&d).is_err());}
}
