//! Factual growth magnitudes are read independently from game configuration.
//! Random selection remains an explicitly stated model, not a prediction.
use crate::model::*;
use rand::{Rng,SeedableRng};
use serde::Deserialize;
use serde_json::{json,Value};
use std::{collections::BTreeMap,sync::OnceLock};

#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
struct Facts{main_increment:BTreeMap<String,Vec<f64>>,roll_max:Stats,range:[f64;2]}
fn facts()->&'static Facts{static FACTS:OnceLock<Facts>=OnceLock::new();FACTS.get_or_init(||serde_json::from_str(include_str!("../data/upgrade.json")).expect("bundled growth facts"))}
fn check(s:&Soul)->Result<(),String>{if s.quality!=6||s.level>15{return Err("强化成长分析目前支持等级 0–15 的六星御魂".into());}if !facts().main_increment.contains_key(&s.main)||!s.value.is_finite()||s.value<0.0{return Err("御魂主属性无效".into());}check_stats(&s.sub)?;if s.sub.len()>4{return Err("副属性不能超过四条".into());}Ok(())}
fn main_at(s:&Soul,level:u8)->f64{let values=&facts().main_increment[&s.main];s.value+values[usize::from(level)]-values[usize::from(s.level)]}
pub fn potential(s:&Soul)->Result<Value,String>{
    check(s)?;
    let remaining=5-s.level/3;let missing=4usize.saturating_sub(s.sub.len()) as u8;
    let mut upper=Stats::new();
    for(k,max)in &facts().roll_max{
        let gains=if s.sub.contains_key(k){remaining.saturating_sub(missing)}else if missing>0&&remaining>0{1+remaining.saturating_sub(missing)}else{0};
        upper.insert(k.clone(),s.sub.get(k).copied().unwrap_or(0.0)+f64::from(gains)*max);
    }
    Ok(json!({"id":s.id,"remaining":remaining,"missing":missing,"mainAt15":main_at(s,15),"upperSub":upper,"model":"各属性上限分别计算：先补足四条副属性，其余节点全部命中该属性且取最大成长。不同属性的上限不能同时达成；不代表概率或实际强化结果。"}))
}
pub fn simulate(s:&Soul,seed:u64)->Result<Value,String>{
    simulate_model(s,seed,false)
}
fn simulate_model(s:&Soul,seed:u64,reinforced:bool)->Result<Value,String>{
    check(s)?;if s.level==15{return Err("该御魂已满级，无可模拟的强化节点".into());}
    let mut rng=rand::rngs::StdRng::seed_from_u64(seed);let mut result=s.clone();let mut steps=vec![];let mut hits:BTreeMap<String,u32>=BTreeMap::new();
    for level in [3,6,9,12,15]{if level<=s.level{continue;}
        let fresh=result.sub.len()<4;
        let keys:Vec<_>=if fresh{ATTRS.iter().filter(|k|!result.sub.contains_key(**k)).map(|k|(*k).to_owned()).collect()}else{result.sub.keys().cloned().collect()};
        let index=if reinforced {
            let group=|k:&str|if ["attack","attack_pct","crit","crit_damage"].contains(&k){0}else if ["hp","hp_pct","defense","defense_pct"].contains(&k){1}else{2};
            let weights:Vec<f64>=keys.iter().map(|k|if fresh{let g=group(k);[36.0,36.0,28.0][g]/keys.iter().filter(|other|group(other)==g).count() as f64}else{1.0+f64::from(*hits.get(k).unwrap_or(&0))}).collect();
            let mut draw=rng.gen_range(0.0..weights.iter().sum::<f64>());let mut chosen=keys.len()-1;
            for(i,w)in weights.iter().enumerate(){if draw<*w{chosen=i;break;}draw-=w;}chosen
        }else{rng.gen_range(0..keys.len())};
        let key=&keys[index];if !fresh{*hits.entry(key.clone()).or_default()+=1;}
        let gain=facts().roll_max[key]*rng.gen_range(facts().range[0]..=facts().range[1]);
        *result.sub.entry(key.clone()).or_default()+=gain;result.level=level;result.value=main_at(s,level);
        steps.push(json!({"level":level,"attribute":key,"gain":gain,"new":fresh,"sub":result.sub,"main":result.value}));
    }
    let selection=if reinforced{"娱乐累计权重：已有属性初始权重为1，每次强化命中后加1；新增先按攻击36%、防御36%、功能28%抽类别，再从类别内剩余属性等概率抽取，类别抽空时归一化。主副属性允许同名，副属性内部去重。"}else{"先补足四条，新增属性在尚未出现的副属性中等概率抽取，主副属性允许同名；之后等概率选择已有副属性。"};
    Ok(json!({"soul":result,"steps":steps,"seed":seed,"potential":potential(s)?,"model":format!("六星主属性增量、副属性最大成长及80%–100%范围来自独立读取的游戏配置。{selection}成长范围内连续均匀抽样；概率与取整是参考假设，不能预测真实强化。" )}))
}
pub fn batch(souls:&[Soul],ids:&[String],seed:u64,model:&str,rule:&Rule)->Result<Value,String>{
    if !["uniform","reinforced"].contains(&model){return Err("请选择等概率或娱乐累计权重模型".into());}
    validate_rule(rule)?;if rule.model.as_deref()==Some("conditions"){return Err("批量推演目前使用副属性权重评分，请选择权重标准".into());}
    let selected:std::collections::BTreeSet<_>=ids.iter().collect();
    if selected.is_empty()||selected.len()!=ids.len()||ids.len()>50_000{return Err("请选择1–50000枚不重复的六星+0御魂".into());}
    let inventory:BTreeMap<_,_>=souls.iter().map(|s|(&s.id,s)).collect();let mut rows=vec![];
    for id in selected{
        let s=inventory.get(id).ok_or_else(||format!("未找到御魂 {id}"))?;
        if s.quality!=6||s.level!=0{return Err(format!("御魂 {id} 不是六星+0，请重新筛选"));}
        // Stable per-ID seed: changing scope/order does not reroll an existing item.
        let item_seed=id.as_bytes().iter().fold(seed^0xcbf29ce484222325u64,|h,b|(h^u64::from(*b)).wrapping_mul(0x100000001b3))&((1u64<<53)-1);
        let result=simulate_model(s,item_seed,model=="reinforced")?;
        let upgraded:Soul=serde_json::from_value(result["soul"].clone()).map_err(|e|e.to_string())?;
        rows.push(json!({"original":s,"simulation":result,"beforeScore":crate::engine::score(s,rule),"afterScore":crate::engine::score(&upgraded,rule)}));
    }
    rows.sort_by(|a,b|b["afterScore"].as_f64().unwrap().total_cmp(&a["afterScore"].as_f64().unwrap()).then_with(||a["original"]["id"].as_str().cmp(&b["original"]["id"].as_str())));
    Ok(json!({"schema":"pingan-upgrade-batch/1","seed":seed,"selectionModel":model,"rule":rule,"rows":rows}))
}
pub fn head_tail(souls:&[Soul],metric:&str)->Result<Value,String>{
    if !ATTRS.contains(&metric){return Err("不支持的头尾分析属性".into());}
    let mut rows=vec![];
    for s in souls.iter().filter(|s|s.quality==6){let p=potential(s)?;let current=s.sub.get(metric).copied().unwrap_or(0.0)+if s.main==metric{s.value}else{0.0};let upper=p["upperSub"][metric].as_f64().unwrap_or(0.0)+if s.main==metric{p["mainAt15"].as_f64().unwrap_or(0.0)}else{0.0};rows.push(json!({"id":s.id,"slot":s.slot,"set":s.set,"level":s.level,"current":current,"upper":upper,"gain":upper-current}));}
    rows.sort_by(|a,b|b["upper"].as_f64().unwrap().total_cmp(&a["upper"].as_f64().unwrap()));
    Ok(json!({"metric":metric,"rows":rows,"model":"独立成长上限分析，含该属性的主属性增量；上限只表示规则模型下的可能数值，不是强化成功概率。"}))
}
#[cfg(test)]mod tests{
    use super::*;
    fn soul()->Soul{Soul{quality:6,level:0,main:"speed".into(),value:12.0,sub:[("speed".into(),2.7),("crit".into(),3.0)].into(),..Soul::default()}}
    #[test]fn potential_accounts_for_forced_new_attributes(){let p=potential(&soul()).unwrap();assert_eq!(p["mainAt15"],57.0);assert_eq!(p["upperSub"]["speed"],11.7);assert_eq!(p["upperSub"]["hit"],16.0);}
    #[test]fn simulation_is_reproducible_increases_main_and_obeys_bounds(){let s=soul();let a=simulate(&s,42).unwrap();assert_eq!(a,simulate(&s,42).unwrap());assert_eq!(a["steps"].as_array().unwrap().len(),5);assert_eq!(a["soul"]["value"],57.0);assert_eq!(a["soul"]["sub"].as_object().unwrap().len(),4);for step in a["steps"].as_array().unwrap(){let max=facts().roll_max[step["attribute"].as_str().unwrap()];let gain=step["gain"].as_f64().unwrap();assert!(gain>=max*0.8&&gain<=max);}}
    #[test]fn fully_upgraded_upper_matches_current(){let mut s=soul();s.level=15;s.value=57.0;let p=potential(&s).unwrap();assert_eq!(p["upperSub"]["speed"],2.7);assert_eq!(p["upperSub"]["hit"],0.0);}
    #[test]fn partial_levels_keep_the_next_node(){let mut s=soul();s.level=1;assert_eq!(potential(&s).unwrap()["remaining"],5);s.level=4;assert_eq!(potential(&s).unwrap()["remaining"],4);}
    #[test]fn batch_scope_order_is_stable_and_inventory_untouched(){let mut a=soul();a.id="a".into();let mut b=a.clone();b.id="b".into();let inventory=vec![a,b];let before=serde_json::to_value(&inventory).unwrap();let rule=default_rule();for model in ["uniform","reinforced"]{let all=batch(&inventory,&["b".into(),"a".into()],42,model,&rule).unwrap();assert_eq!(all,batch(&inventory,&["a".into(),"b".into()],42,model,&rule).unwrap());let one=batch(&inventory,&["a".into()],42,model,&rule).unwrap();let row=all["rows"].as_array().unwrap().iter().find(|r|r["original"]["id"]=="a").unwrap();assert_eq!(row,&one["rows"][0]);assert!(row["afterScore"].as_f64().unwrap()>row["beforeScore"].as_f64().unwrap());}assert_eq!(before,serde_json::to_value(&inventory).unwrap());}
    #[test]fn batch_rejects_invalid_scope_and_model(){let mut s=soul();s.id="a".into();let rule=default_rule();for ids in [vec![],vec!["missing".into()],vec!["a".into(),"a".into()]]{assert!(batch(&[s.clone()],&ids,42,"uniform",&rule).is_err());}s.level=1;assert!(batch(&[s.clone()],&["a".into()],42,"uniform",&rule).is_err());s.level=0;assert!(batch(&[s],&["a".into()],42,"prediction",&rule).is_err());}
    #[test]fn new_attributes_are_unique_but_may_match_main(){let mut s=soul();s.main="attack_pct".into();assert!(potential(&s).unwrap()["upperSub"]["attack_pct"].as_f64().unwrap()>0.0);for reinforced in [true,false]{let mut same_main_seen=false;for seed in 0..100{let result=simulate_model(&s,seed,reinforced).unwrap();let mut seen=s.sub.clone();for step in result["steps"].as_array().unwrap(){let key=step["attribute"].as_str().unwrap();if step["new"]==true{assert!(!seen.contains_key(key));same_main_seen|=key==s.main;}seen.insert(key.into(),1.0);}assert_eq!(result["soul"]["sub"].as_object().unwrap().len(),4);}assert!(same_main_seen);}}
    #[test]fn fresh_draw_keeps_category_weight_when_category_has_one_attribute_left(){let mut s=soul();s.level=12;s.sub=[("attack".into(),24.0),("attack_pct".into(),2.7),("crit".into(),2.7)].into();let mut attacks=0;for seed in 0..3000{let result=simulate_model(&s,seed,true).unwrap();if result["steps"][0]["attribute"]=="crit_damage"{attacks+=1;}}assert!((960..=1200).contains(&attacks),"expected approximately36% not a per-attribute9%: {attacks}");}
}
