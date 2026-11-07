use serde_json::{json,Value};
use std::collections::BTreeMap;
fn rewards(raw:&Value,values:&Value)->Value{json!(values.as_array().into_iter().flatten().filter_map(|row|{
    let id=row[0].as_u64()?.to_string();let amount=row[1].as_f64()?;
    Some(json!({"id":id,"name":raw["configs"]["currency"][&id]["name"].as_str().unwrap_or("未识别资源"),"amount":amount}))
}).collect::<Vec<_>>())}
pub fn status(raw:&Value)->Value{
    let cards=raw["realmInfo"]["ls_cards"].as_array().map(|rows|rows.iter().map(|row|{
        let id=row[0].as_str().unwrap_or("");let card=&raw["realmCards"][id];let started=row[1].as_f64().filter(|n|*n>0.0);let hours=card["totalTime"].as_f64().filter(|n|*n>0.0);let config=&raw["configs"]["JJCard"][card["itemid"].to_string()];
        let rewards:Vec<_>=config["reward"].as_array().into_iter().flatten().enumerate().map(|(i,id)|{let key=id.to_string();let rate=card["produceValue"][i].as_f64();json!({"id":key,"name":raw["configs"]["currency"][&key]["name"].as_str().unwrap_or("未识别资源"),"perHour":rate,"total":rate.zip(hours).map(|(r,h)|r*h)})}).collect();
        json!({"id":id,"itemId":card["itemid"],"name":config["name"],"startedAt":started,"hours":hours,"endsAt":started.zip(hours).map(|(t,h)|t+h*3600.0),"perHour":card["produceValue"],"rewardIds":config["reward"],"rewards":rewards})
    }).collect::<Vec<_>>());
    let record=&raw["set_other"];let foster=if let Some(hero)=record["herouid"].as_str(){
        let started=record["t"].as_f64().filter(|n|*n>0.0);let hours=raw["configs"]["Constant"]["643"]["value"][0].as_f64().filter(|n|*n>0.0);let friend=record["frienduid"].as_str().unwrap_or("");let config=&raw["configs"]["JJCard"][record["card_item"].to_string()];
        Some(json!({"heroId":hero,"heroName":raw["heroes"][hero]["_name"],"friendId":friend,"friendName":raw["friendNames"][friend]["name"].as_str().or_else(||raw["friendNames"][friend]["_name"].as_str()),"startedAt":started,"hours":hours,"endsAt":started.zip(hours).map(|(t,h)|t+h*3600.0),"cardName":config["name"],"rewards":rewards(raw,&record["hreward"])}))
    }else{None};
    json!({"capturedAt":raw["reader"]["capturedAt"],"pid":raw["reader"]["pid"],"cards":cards,"foster":foster,"fosterLoaded":record.is_object(),"accruedRewards":rewards(raw,&raw["realmInfo"]["already_reward"])})
}
pub fn guild(raw:&Value)->Value{
    let guild=&raw["guildDetail"];let members=guild["members"].as_array().map(|rows|rows.iter().map(|row|{
        let detail=if row["id"]==raw["guildSelectedMember"]["id"] && !row["id"].is_null(){&raw["guildSelectedMember"]}else{&raw["friendNames"][row["id"].as_str().unwrap_or("")]};
        let value=|key:&str|if row[key].is_null(){detail[key].clone()}else{row[key].clone()};
        json!({"id":row["id"],"name":row["name"],"level":row["level"],"duty":row["duty"],"weekly":value("weekly_feats"),"lastWeekly":value("last_weekly_feats"),"total":value("total_feats"),"donated":value("history_donate"),"active":value("weekly_active_score"),"joinedAt":row["join_time"],"offlineAt":row["offline_time"],"pvpScore":value("pvp_score")})
    }).collect::<Vec<_>>());
    json!({"name":guild["name"],"level":guild["guild_lv"],"expectedCount":guild["member_count"],"funds":guild["funds"],"activeCount":guild["active_member_count"],"createdAt":guild["create_time"],"pvpScore":guild["pvp_score"],"construction":guild["construction"],"creator":guild["creator"],"declaration":guild["declare"],"activeScore":guild["active_score"],"medals":guild["sum_insignia_count"],"emblemScore":guild["trial_emblem_score"],"activeRank":guild["active_rank_pos"].as_i64().filter(|n|*n>0),"pvpRank":guild["pvp_rank_pos"].as_i64().filter(|n|*n>0),"creviceDifficulty":guild["guild_crevice_difficulty"],"creviceCleared":guild["guild_crevice_defeated_difficulty"],"season":guild["season_pvp_season"],"members":members,"capturedAt":raw["reader"]["capturedAt"]})
}
pub fn inventory(raw:&Value)->Value{
    let mut groups:BTreeMap<(u64,String,String),u64>=BTreeMap::new();let mut unknown=0;
    for row in raw["lbscards"].as_object().into_iter().flatten().map(|(_,v)|v){
        if let(Some(id),Some(hours),Some(rewards))=(row["itemid"].as_u64(),row["ct"].as_f64(),row["rv"].as_array()){
            if let Some(rewards)=rewards.iter().map(Value::as_f64).collect::<Option<Vec<_>>>(){*groups.entry((id,hours.to_string(),serde_json::to_string(&rewards).unwrap())).or_default()+=1;}else{unknown+=1;}
        }else{unknown+=1;}
    }
    for(key,count)in raw["lbscards_bag"].as_object().into_iter().flatten(){
        let parts:Vec<_>=key.split('_').collect();let parsed=||Some((parts.first()?.parse::<u64>().ok()?,parts.get(3)?.parse::<f64>().ok()?,vec![parts.get(1)?.parse::<f64>().ok()?,parts.get(2)?.parse::<f64>().ok()?],count.as_u64()?));
        if let Some((id,hours,rewards,count))=parsed(){*groups.entry((id,hours.to_string(),serde_json::to_string(&rewards).unwrap())).or_default()+=count;}else{unknown+=1;}
    }
    let rows:Vec<_>=groups.into_iter().map(|((id,hours,values),quantity)|{
        let config=&raw["configs"]["JJCard"][id.to_string()];let values:Vec<f64>=serde_json::from_str(&values).unwrap_or_default();let hours: f64=hours.parse().unwrap_or(0.0);
        let rewards:Vec<_>=config["reward"].as_array().into_iter().flatten().enumerate().map(|(i,id)|{let key=id.as_str().map(str::to_owned).unwrap_or_else(||id.to_string());let amount=values.get(i).copied();json!({"id":key,"name":raw["configs"]["currency"][&key]["name"].as_str().unwrap_or("未识别资源"),"perHour":amount,"totalPerCard":amount.map(|a|a*hours)})}).collect();
        json!({"itemId":id,"name":config["name"].as_str().unwrap_or("未识别结界卡"),"star":config["star"],"type":config["type"],"hours":hours,"quantity":quantity,"rewards":rewards})
    }).collect();
    json!({"groups":rows,"unknown":unknown,"source":"游戏库存快照；包含普通与折叠结界卡。收益按每小时产出 × 持续小时数计算，不含寄养分成、额外奖励或已放置卡的剩余收益。"})
}
#[cfg(test)]mod tests{use super::*;
    #[test]fn folded_and_individual_cards_merge_without_expanding_large_counts(){let raw=json!({"lbscards":{"a":{"itemid":200001,"ct":4,"rv":[800,0]}},"lbscards_bag":{"200001_800_0_4":50},"configs":{"JJCard":{"200001":{"name":"测试卡","star":1,"reward":[900015]}},"currency":{"900015":{"name":"经验"}}}});let result=inventory(&raw);assert_eq!(result["groups"].as_array().unwrap().len(),1);assert_eq!(result["groups"][0]["quantity"],51);assert_eq!(result["groups"][0]["rewards"][0]["totalPerCard"],3200.0);}
    #[test]fn own_and_foster_use_separate_verified_durations(){
        let raw=json!({"realmInfo":{"ls_cards":[["card",1700000000,0]],"already_reward":[[900002,3]]},"realmCards":{"card":{"itemid":200033,"totalTime":14,"produceValue":[5]}},"set_other":{"herouid":"hero","frienduid":"friend","t":1700000010,"card_item":200033,"hreward":[[900002,50]]},"configs":{"Constant":{"643":{"value":[6]}},"JJCard":{"200033":{"name":"太鼓","reward":[900002]}},"currency":{"900002":{"name":"勾玉"}}}});
        let out=status(&raw);assert_eq!(out["cards"][0]["endsAt"],1700050400.0);assert_eq!(out["foster"]["endsAt"],1700021610.0);assert_eq!(out["foster"]["rewards"][0]["amount"],50.0);
        assert_eq!(out["cards"][0]["rewards"][0]["total"],70.0);
        let mut absent=raw;absent["configs"]["Constant"]=Value::Null;assert!(status(&absent)["foster"]["endsAt"].is_null());
        assert!(status(&json!({}))["cards"].is_null());assert!(!status(&json!({}))["fosterLoaded"].as_bool().unwrap());assert_eq!(status(&json!({"realmInfo":{"ls_cards":[]},"set_other":{}}))["cards"],json!([]));
    }
    #[test]fn missing_member_fields_stay_unknown(){let out=guild(&json!({"guildDetail":{"member_count":2,"members":[{"id":"one","name":"member","weekly_feats":0}]}}));assert_eq!(out["members"][0]["weekly"],0);assert!(out["members"][0]["offlineAt"].is_null());assert_eq!(out["expectedCount"],2);}
    #[test]fn member_details_merge_only_into_the_same_member_without_replacing_explicit_zero(){
        let out=guild(&json!({"guildDetail":{"members":[{"id":"one","weekly_feats":0},{"id":"two"},{"id":"three"}]},"guildSelectedMember":{"id":"one","weekly_feats":50,"last_weekly_feats":591},"friendNames":{"two":{"weekly_feats":12}}}));
        assert_eq!(out["members"][0]["weekly"],0);assert_eq!(out["members"][0]["lastWeekly"],591);assert_eq!(out["members"][1]["weekly"],12);assert!(out["members"][2]["weekly"].is_null());
    }
}
