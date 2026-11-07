use crate::model::*;
use rand::{Rng, SeedableRng};

pub fn document() -> Document {
    let mut rng=rand::rngs::StdRng::seed_from_u64(20261025);
    let names=["暴击示例套","攻击示例套","防御示例套","命中示例套"];
    let mut souls=Vec::new();
    for i in 0..240 {
        let slot=(i%6+1) as u8;
        let main=match slot {1=>"attack",3=>"defense",5=>"hp",2 if i%4==0=>"speed",6 if i%4==1=>"crit",6=>"crit_damage",_=>"attack_pct"};
        let max=match main {"attack"=>486.0,"defense"=>104.0,"hp"=>2052.0,"speed"=>57.0,"crit_damage"=>89.0,_=>55.0};
        let level=if i%5==0 {0} else {15};
        let mut sub=Stats::new();
        let mut pool:Vec<&str>=ATTRS.iter().copied().filter(|a|*a!=main).collect();
        for _ in 0..if level==0 {3}else{4} {let j=rng.gen_range(0..pool.len());let key=pool.remove(j);let rolls=if level==0{1.0}else{rng.gen_range(1..=4) as f64};sub.insert(key.into(),(roll_size(key)*rolls*rng.gen_range(0.92..1.08)*100.0).round()/100.0);}
        souls.push(Soul {id:format!("demo-{:04}",i+1),set:names[(i/6)%names.len()].into(),slot,quality:6,level,main:main.into(),value:if level==15{max}else{max/5.0},sub,innate:Stats::new(),locked:i%17==0,equipped:if i<6{"输出示例".into()}else{String::new()},initial_substats:Some(if level==0{3}else{4})});
    }
    let heroes=vec![Hero{id:"demo-dps".into(),name:"输出示例".into(),rarity:"SSR".into(),level:40,star:6,awakened:true,shards:32,bonus:Stats::new(),base:[("attack".into(),3300.0),("hp".into(),12000.0),("defense".into(),450.0),("speed".into(),112.0),("crit".into(),10.0),("crit_damage".into(),150.0)].into()},Hero{id:"demo-speed".into(),name:"速度示例".into(),rarity:"SR".into(),level:35,star:5,awakened:true,shards:18,bonus:Stats::new(),base:[("attack".into(),2100.0),("hp".into(),11000.0),("defense".into(),400.0),("speed".into(),118.0),("crit".into(),5.0),("crit_damage".into(),150.0)].into()}];
    Document{name:"演示档案 · 非真实游戏数据".into(),souls,heroes,sets:names.iter().zip([("crit",15.0),("attack_pct",15.0),("defense_pct",30.0),("hit",15.0)]).map(|(name,(attr,v))|SetDef{name:(*name).into(),two_piece:[(attr.into(),v)].into(),..SetDef::default()}).collect(),resources:vec![Resource{name:"金币（演示）".into(),amount:1258000.0,unit:"枚".into()},Resource{name:"勾玉（演示）".into(),amount:3280.0,unit:"枚".into()},Resource{name:"体力（演示）".into(),amount:5200.0,unit:"点".into()}],tasks:vec![Task{id:"daily-1".into(),name:"整理御魂库存".into(),done:false,category:"日常".into(),period:String::new()},Task{id:"daily-2".into(),name:"记录本周资源".into(),done:true,category:"每周".into(),period:String::new()}],guild:vec![GuildMember{id:"demo-1".into(),name:"示例成员甲".into(),level:60,contribution:1800.0,note:"仅用于演示".into()},GuildMember{id:"demo-2".into(),name:"示例成员乙".into(),level:60,contribution:1260.0,note:String::new()}],..Document::default()}
}
