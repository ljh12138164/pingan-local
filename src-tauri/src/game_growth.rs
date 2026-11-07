//! Game growth table, checked against independently captured base panels.
use crate::model::Stats;
use serde_json::Value;
const GROWTH:[[[f64;6];3];60]=include!("../data/growth.rs");

pub fn base(template:&Value,level:u8,star:u8,awake:bool)->Option<Stats>{
    if !(1..=60).contains(&level)||!(1..=6).contains(&star){return None;}
    let row=&GROWTH[level as usize-1];let index=star as usize-1;
    let(hp,attack,defense)=(row[0][index],row[1][index],row[2][index]);
    if ["hpStarSt","atkStarSt","defStarSt"].iter().any(|k|template[k].as_f64()!=Some(1.0)){return None;}
    let mut stats=Stats::new();
    for(name,delta,increment,coefficient,offset)in [("hp","hpDelta","awakeIncHpDelta",hp,1.0),("attack","attackDelta","awakeIncAttackDelta",attack,0.0),("defense","defenseDelta","awakeIncDefenseDelta",defense,0.0)]{
        let factor=template[delta].as_f64()?+if awake{template[increment].as_f64().unwrap_or(0.0)}else{0.0};
        stats.insert(name.into(),coefficient*factor+offset);
    }
    Some(stats)
}

#[cfg(test)]mod tests{
    use super::*;
    #[test]fn calibrated_growth_matches_verified_level40_panel(){let t=serde_json::json!({"hpStarSt":1,"atkStarSt":1,"defStarSt":1,"hpDelta":0.92,"attackDelta":1.16,"defenseDelta":0.8,"awakeIncHpDelta":0.07,"awakeIncAttackDelta":0.11,"awakeIncDefenseDelta":0.07});let b=base(&t,40,6,true).unwrap();assert!((b["hp"]-11279.08).abs()<1e-6);assert!((b["attack"]-3403.6).abs()<1e-6);assert!((b["defense"]-383.67).abs()<1e-6);let low=base(&t,4,2,false).unwrap();assert!((low["attack"]-172.84).abs()<1e-6);assert!(base(&t,0,2,true).is_none());assert!(base(&t,40,7,true).is_none());}
}
