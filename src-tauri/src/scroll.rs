use serde_json::{json, Value};
use rusqlite::{params, Connection};
type Result<T> = std::result::Result<T,String>;

// Progress is server total / the manager's current unlock threshold. The
// painting's static unlock_contribution is not the live server threshold.
pub fn snapshot(raw: &Value) -> Value {
    let source=&raw["scrollData"];
    let threshold=source["unlockDonation"].as_f64().filter(|n|n.is_finite()&&*n>0.0);
    let mut paintings=Vec::new();
    for (id, painting) in source["paintings"].as_object().into_iter().flatten() {
        let server=&source["serverInfo"][id];
        let finished=server["finish_time"].as_f64().filter(|n|*n>0.0);
        let score=server["score"].as_f64().filter(|n|n.is_finite()&&*n>=0.0);
        let progress=if finished.is_some(){Some(100.0)}else{score.zip(threshold).map(|(s,t)|(s/t*100.0).clamp(0.0,100.0))};
        let personal=source["selfInfo"]["score"].as_object().map(|scores|scores.get(id).and_then(Value::as_f64).unwrap_or(0.0));
        paintings.push(json!({"id":id,"name":painting["name"],"issue":painting["issue"],"heroId":painting["hero_id"],"progress":progress,"score":score,"personalScore":personal,"finishedAt":finished,"top20":null,"top100":null}));
    }
    paintings.sort_by_key(|p|p["id"].as_str().and_then(|s|s.parse::<u32>().ok()).unwrap_or(0));
    json!({"capturedAt":raw["reader"]["capturedAt"],"serverId":raw["player"]["server_id"],"loaded":source["serverInfo"].as_object().is_some_and(|rows|!rows.is_empty())&&!paintings.is_empty(),"threshold":threshold,"paintings":paintings,"error":source["error"],"source":"own-game-cache"})
}

fn records(db:&Connection,profile:&str,table:&str)->Result<Vec<Value>>{
    // table is supplied only by the two callers below, never by user input.
    let mut query=db.prepare(&format!("SELECT data FROM {table} WHERE profile_id=?1 ORDER BY rowid DESC LIMIT 1000")).map_err(|e|e.to_string())?;
    let rows=query.query_map([profile],|r|r.get::<_,String>(0)).map_err(|e|e.to_string())?;
    rows.map(|r|serde_json::from_str(&r.map_err(|e|e.to_string())?).map_err(|e|e.to_string())).collect()
}

pub fn execute(db:&Connection,operation:&str,input:&Value,snapshot:&Value)->Result<Value>{
    let profile=input["id"].as_str().ok_or("缺少角色档案")?;
    if snapshot["loaded"]==true && input["viewSnapshot"].is_null() {
        let mut issues=std::collections::BTreeMap::<u64,Vec<Value>>::new();
        for painting in snapshot["paintings"].as_array().into_iter().flatten(){if let Some(issue)=painting["issue"].as_u64(){issues.entry(issue).or_default().push(painting.clone());}}
        for(issue,paintings)in issues {if paintings.len()!=6{continue;}let mut record=snapshot.clone();record["issue"]=json!(issue);record["paintings"]=json!(paintings);db.execute("INSERT INTO scroll_history VALUES(?1,?2,?3) ON CONFLICT(profile_id,issue) DO UPDATE SET data=excluded.data",params![profile,i64::try_from(issue).map_err(|_|"绘卷期次超出范围")?,record.to_string()]).map_err(|e|e.to_string())?;}
    }
    let monitors=records(db,profile,"scroll_monitors")?;
    match operation {
        "scroll_state"=>Ok(json!({"history":records(db,profile,"scroll_history")?,"monitors":monitors})),
        "save_scroll_monitor"=>{
            let issue=input["issue"].as_u64().filter(|n|*n>0&&*n<=u32::MAX as u64).ok_or("绘卷期次无效")?;
            let painting=input["paintingId"].as_str().filter(|s|!s.is_empty()&&s.len()<30&&s.chars().all(|c|c.is_ascii_digit())).ok_or("绘卷编号无效")?;
            let target=input["target"].as_f64().filter(|n|n.is_finite()&&*n>0.0&&*n<=100.0).ok_or("提醒阈值应大于 0 且不超过 100%")?;
            let enabled=input["enabled"].as_bool().ok_or("提醒状态无效")?;
            let key=input["monitorId"].as_str().filter(|s|!s.is_empty()).map(str::to_owned).unwrap_or_else(crate::store::id);
            if key.len()>100{return Err("提醒编号无效".into());}
            if monitors.len()>=1000&&!monitors.iter().any(|m|m["id"]==key){return Err("本机每个角色最多保存 1000 条绘卷提醒".into());}
            if monitors.iter().any(|m|m["id"]!=key&&m["issue"]==issue&&m["paintingId"]==painting&&m["target"]==target){return Err("这个绘卷与阈值已添加，请修改已有提醒".into());}
            let row=json!({"id":key,"issue":issue,"paintingId":painting,"target":target,"enabled":enabled,"notifiedAt":null});
            db.execute("INSERT INTO scroll_monitors VALUES(?1,?2,?3) ON CONFLICT(profile_id,id) DO UPDATE SET data=excluded.data",params![profile,key,row.to_string()]).map_err(|e|e.to_string())?;
            Ok(json!(records(db,profile,"scroll_monitors")?))
        },
        "delete_scroll_monitor"=>{let key=input["monitorId"].as_str().ok_or("缺少提醒编号")?;let changed=db.execute("DELETE FROM scroll_monitors WHERE profile_id=?1 AND id=?2",params![profile,key]).map_err(|e|e.to_string())?;if changed==0{return Err("这条提醒已不存在，请刷新后重试".into());}Ok(json!(records(db,profile,"scroll_monitors")?))},
        "evaluate_scroll_monitors"=>{
            let mut alerts=vec![];
            if snapshot["loaded"]==true {for mut monitor in monitors {
                if monitor["enabled"]!=true||!monitor["notifiedAt"].is_null(){continue;}
                let matched=snapshot["paintings"].as_array().into_iter().flatten().find(|p|p["issue"]==monitor["issue"]&&p["id"]==monitor["paintingId"]&&p["progress"].as_f64().zip(monitor["target"].as_f64()).is_some_and(|(progress,target)|progress>=target));
                if let Some(painting)=matched{let previous=monitor.to_string();monitor["notifiedAt"]=json!(chrono::Utc::now().to_rfc3339());let changed=db.execute("UPDATE scroll_monitors SET data=?1 WHERE profile_id=?2 AND id=?3 AND data=?4",params![monitor.to_string(),profile,monitor["id"].as_str(),previous]).map_err(|e|e.to_string())?;if changed==1{alerts.push(json!({"id":monitor["id"],"issue":monitor["issue"],"name":painting["name"],"target":monitor["target"],"progress":painting["progress"]}));}}
            }}
            Ok(json!({"alerts":alerts,"monitors":records(db,profile,"scroll_monitors")?}))
        },
        _=>Err("未知绘卷操作".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cached_scroll_progress_uses_live_threshold_and_preserves_unknowns(){
        let mut raw=json!({"scrollData":{"unlockDonation":1000,"paintings":{"1":{"id":1,"name":"一","issue":84,"hero_id":609,"unlock_contribution":20},"2":{"id":2,"name":"二"},"3":{"id":3,"name":"三"}},"serverInfo":{"1":{"score":200},"2":{"score":999,"finish_time":123}},"selfInfo":{"score":{"1":5}}}});
        let result=snapshot(&raw);let rows=result["paintings"].as_array().unwrap();
        assert_eq!(rows[0]["progress"],20.0);assert_eq!(rows[0]["personalScore"],5.0);
        assert_eq!(rows[1]["progress"],100.0);assert_eq!(rows[1]["personalScore"],0.0);
        assert!(rows[2]["progress"].is_null());assert!(rows[0]["top20"].is_null());
        raw["scrollData"]["unlockDonation"]=Value::Null;assert!(snapshot(&raw)["paintings"][0]["progress"].is_null());
        assert_eq!(snapshot(&json!({}))["loaded"],false);
    }
    #[test]
    fn scroll_reminders_are_isolated_and_only_fire_once_for_known_progress(){
        let db=Connection::open_in_memory().unwrap();db.execute_batch("CREATE TABLE scroll_history(profile_id TEXT,issue INTEGER,data TEXT,PRIMARY KEY(profile_id,issue));CREATE TABLE scroll_monitors(profile_id TEXT,id TEXT,data TEXT,PRIMARY KEY(profile_id,id));").unwrap();
        let data=json!({"loaded":true,"paintings":[{"id":"627","issue":84,"name":"卷一","progress":90}]});
        let input=json!({"id":"a","issue":84,"paintingId":"627","target":90.0,"enabled":true});
        execute(&db,"save_scroll_monitor",&input,&data).unwrap();assert!(execute(&db,"save_scroll_monitor",&input,&data).is_err());
        assert_eq!(execute(&db,"evaluate_scroll_monitors",&json!({"id":"b"}),&data).unwrap()["alerts"],json!([]));
        assert_eq!(execute(&db,"evaluate_scroll_monitors",&json!({"id":"a"}),&json!({"loaded":false})).unwrap()["alerts"],json!([]));
        assert_eq!(execute(&db,"evaluate_scroll_monitors",&json!({"id":"a"}),&data).unwrap()["alerts"].as_array().unwrap().len(),1);
        assert_eq!(execute(&db,"evaluate_scroll_monitors",&json!({"id":"a"}),&data).unwrap()["alerts"],json!([]));
        let mut invalid=input;invalid["target"]=json!(101);assert!(execute(&db,"save_scroll_monitor",&invalid,&data).is_err());
    }
}
