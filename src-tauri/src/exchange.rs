//! Virtual exchange only: independently read game magnitudes, explicitly assumed randomness.
use crate::model::*;
use rand::{Rng,SeedableRng};
use serde::Deserialize;
use serde_json::{json,Value};
use std::sync::OnceLock;

fn config()->&'static Value{static C:OnceLock<Value>=OnceLock::new();C.get_or_init(||serde_json::from_str(include_str!("../data/equipment.json")).expect("bundled equipment facts"))}
const BOSSES:[&str;6]=["土蜘蛛","胧车","荒骷髅","地震鲶","蜃气楼","鬼灵歌伎"];
const STARS:[&str;6]=["八咫镜","天羽羽斩","预言星盘","月之石","纺缘锤","稻荷穗箭"];
fn sets(kind:&str)->Vec<(String,String)>{config()["equip_suit"].as_object().unwrap().iter().filter_map(|(id,s)|{let name=s["suit_n"].as_str()?;let ordinary=s["suit_attr_list"][1].as_array().is_some_and(|a|!a.is_empty());let allowed=match kind{"gold"=>ordinary,"boss"=>BOSSES.contains(&name)||STARS.contains(&name),_=>false};allowed.then(||(id.clone(),name.into()))}).collect()}
fn mains(slot:u8)->Stats{
    let c=&config()["equip_init"][format!("{}0006",slot+10)];
    let fixed=match slot{1=>Some("attack"),3=>Some("defense"),5=>Some("hp"),_=>None};
    c["base_attr"].as_array().unwrap().iter().enumerate().filter_map(|(i,row)|{let raw=row[0].as_str()?;let (key,factor)=crate::game_convert::attr(raw).ok()?;if fixed.is_some_and(|f|f!=key){return None;}Some((key.into(),c["base_attr_v"][i].as_f64().unwrap()*factor))}).collect()
}
pub fn options()->Value{json!({"sets":sets("gold").into_iter().chain(sets("boss")).map(|(id,name)|json!({"id":id,"kind":if BOSSES.contains(&name.as_str()){"boss"}else if STARS.contains(&name.as_str()){"star"}else{"gold"},"name":name})).collect::<Vec<_>>(),"mains":(1..=6).map(|slot|(slot.to_string(),json!(mains(slot)))).collect::<serde_json::Map<_,_>>()})}

#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Request{kind:String,set:String,slot:u8,count:usize,seed:u64}
fn safe_seed(seed:u64)->Result<(),String>{if seed>9_007_199_254_740_991{Err("随机种子需要0–9007199254740991之间的整数".into())}else{Ok(())}}
fn sub_draw(rng:&mut impl Rng,sub:&Stats)->String{
    let groups:[&[&str];3]=[&["attack","attack_pct","crit","crit_damage"],&["hp","hp_pct","defense","defense_pct"],&["speed","hit","resist"]];
    let available:Vec<Vec<_>>=groups.iter().map(|group|group.iter().filter(|key|!sub.contains_key(**key)).copied().collect()).collect();
    let weights:Vec<_>=[36.0,36.0,28.0].into_iter().enumerate().map(|(i,w)|if available[i].is_empty(){0.0}else{w}).collect();
    let mut draw=rng.gen_range(0.0..weights.iter().sum::<f64>());let mut group=2;
    for(i,w)in weights.iter().enumerate(){if draw<*w{group=i;break;}draw-=w;}
    available[group][rng.gen_range(0..available[group].len())].into()
}
pub fn generate(request:Request)->Result<Value,String>{
    safe_seed(request.seed)?;
    if !(1..=6).contains(&request.slot)||!(1..=1000).contains(&request.count){return Err("号位需要1–6，单批兑换数量需要1–1000".into());}
    let pool=sets(&request.kind);if pool.is_empty(){return Err("请选择金蛇皮或首领／星痕兑换".into());}
    let chosen=if request.set.is_empty(){None}else{Some(pool.iter().find(|(_,name)|name==&request.set).ok_or("该套装不在所选兑换范围内")?)};
    let base=mains(request.slot);let main_keys:Vec<_>=base.keys().collect();
    let maxima:Stats=config()["equip_attr"]["6"]["attr_list"].as_array().unwrap().iter().map(|row|{let(key,factor)=crate::game_convert::attr(row[0].as_str().unwrap()).expect("known sub attribute");(key.into(),row[1].as_f64().unwrap()*factor)}).collect();
    let special=match request.slot{2=>&["speed"][..],4=>&["hit","resist"][..],6=>&["crit","crit_damage"][..],_=>&[][..]};
    let stem=format!("virtual:{}:{}:{}:{}",request.kind,chosen.map(|(id,_)|id.as_str()).unwrap_or("all"),request.slot,request.seed);
    let mut souls=vec![];
    for index in 0..request.count{
        let id=format!("{stem}:{index}");let item_seed=id.as_bytes().iter().fold(0xcbf29ce484222325u64,|h,b|(h^u64::from(*b)).wrapping_mul(0x100000001b3));let mut rng=rand::rngs::StdRng::seed_from_u64(item_seed);
        let (_,set)=chosen.unwrap_or_else(||&pool[rng.gen_range(0..pool.len())]);
        let main=if special.is_empty(){main_keys[0].to_string()}else{let is_special=rng.gen_bool(0.1);let candidates:Vec<_>=main_keys.iter().filter(|k|special.contains(&k.as_str())==is_special).collect();candidates[rng.gen_range(0..candidates.len())].to_string()};
        let mut sub=Stats::new();let initial=rng.gen_range(2..=4);
        for _ in 0..initial{let key=sub_draw(&mut rng,&sub);let maximum=maxima[&key];sub.insert(key,maximum*rng.gen_range(0.8..=1.0));}
        let innate=if request.kind=="boss"{let attr=["attack_pct","hp_pct","defense_pct","crit","hit","resist"][rng.gen_range(0..6)];[(attr.into(),if attr=="defense_pct"{16.0}else{8.0})].into()}else{Stats::new()};
        souls.push(Soul{id,set:set.clone(),slot:request.slot,quality:6,level:0,value:base[&main],main,sub,innate,initial_substats:Some(initial),..Soul::default()});
    }
    Ok(json!({"schema":"pingan-exchange/1","kind":request.kind,"set":request.set,"slot":request.slot,"seed":request.seed,"count":request.count,"referenceCost":request.count*50,"souls":souls}))
}
pub fn reinforce(souls:&[Soul],ids:&[String],seed:u64,model:&str,rule:&Rule)->Result<Value,String>{
    safe_seed(seed)?;if souls.is_empty()||souls.len()>1000{return Err("虚拟强化每批需要1–1000枚".into());}
    let unique:std::collections::BTreeSet<_>=souls.iter().map(|s|&s.id).collect();if unique.len()!=souls.len()||souls.iter().any(|s|!s.id.starts_with("virtual:")||s.id.len()>200||s.slot<1||s.slot>6){return Err("虚拟御魂编号或号位无效".into());}
    crate::upgrade::batch(souls,ids,seed,model,rule)
}

#[cfg(test)]mod tests{
    use super::*;
    fn request(kind:&str,set:&str,slot:u8,count:usize,seed:u64)->Request{Request{kind:kind.into(),set:set.into(),slot,count,seed}}
    #[test]fn reproducible_prefix_and_independent_fields(){for kind in ["gold","boss"]{for slot in 1..=6{let result=generate(request(kind,"",slot,200,42)).unwrap();assert_eq!(result,generate(request(kind,"",slot,200,42)).unwrap());let short=generate(request(kind,"",slot,5,42)).unwrap();assert_eq!(&result["souls"].as_array().unwrap()[..5],short["souls"].as_array().unwrap());for raw in result["souls"].as_array().unwrap(){let soul:Soul=serde_json::from_value(raw.clone()).unwrap();assert_eq!(soul.value,mains(slot)[&soul.main]);assert!((2..=4).contains(&soul.sub.len()));assert_eq!(soul.initial_substats.unwrap() as usize,soul.sub.len());assert_eq!(soul.innate.len(),usize::from(kind=="boss"));assert_eq!(soul.level,0);assert_eq!(soul.quality,6);assert!(!soul.locked&&soul.equipped.is_empty());}}}}
    #[test]fn historical_special_main_distribution_and_fixed_slots(){for slot in [2,4,6]{let result=generate(request("gold","三味",slot,1000,42)).unwrap();let special=match slot{2=>vec!["speed"],4=>vec!["hit","resist"],_=>vec!["crit","crit_damage"]};let count=result["souls"].as_array().unwrap().iter().filter(|s|special.contains(&s["main"].as_str().unwrap())).count();assert!((65..=135).contains(&count),"slot{slot}: {count}");}assert_eq!(mains(1),[("attack".into(),81.0)].into());assert_eq!(mains(3),[("defense".into(),14.0)].into());assert_eq!(mains(5),[("hp".into(),342.0)].into());}
    #[test]fn validation_and_virtual_only_reinforcement(){for req in [request("bad","",2,10,42),request("gold","八咫镜",2,10,42),request("boss","三味",2,10,42),request("gold","三味",0,10,42),request("gold","三味",2,0,42),request("gold","三味",2,1001,42),request("gold","三味",2,10,u64::MAX)]{assert!(generate(req).is_err());}let result=generate(request("boss","八咫镜",2,10,42)).unwrap();let mut souls:Vec<Soul>=serde_json::from_value(result["souls"].clone()).unwrap();let ids:Vec<_>=souls.iter().map(|s|s.id.clone()).collect();let original=serde_json::to_value(&souls).unwrap();let upgraded=reinforce(&souls,&ids,42,"reinforced",&default_rule()).unwrap();assert_eq!(upgraded["rows"].as_array().unwrap().len(),10);assert_eq!(original,serde_json::to_value(&souls).unwrap());for row in upgraded["rows"].as_array().unwrap(){assert_eq!(row["original"]["innate"],row["simulation"]["soul"]["innate"]);assert_eq!(row["simulation"]["soul"]["level"],15);}souls[0].id="real-item".into();assert!(reinforce(&souls,&ids,42,"uniform",&default_rule()).is_err());}
}
