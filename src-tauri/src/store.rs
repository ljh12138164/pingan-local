use crate::{demo,engine,importer,model::*};
use chrono::{Utc,Datelike};
use rusqlite::{params,Connection};
use serde::de::DeserializeOwned;
use serde_json::{json,Value};
use std::path::{Path,PathBuf};

type Result<T> = std::result::Result<T,String>;
fn err(e:impl std::fmt::Display)->String{e.to_string()}
fn now()->String{Utc::now().to_rfc3339()}
fn task_period(category:&str)->Option<String>{let day=chrono::Local::now().date_naive();match category{"日常"=>Some(day.to_string()),"每周"=>Some((day-chrono::Duration::days(i64::from(day.weekday().num_days_from_monday()))).to_string()),_=>None}}
pub fn id()->String{format!("{}-{:08x}",Utc::now().timestamp_millis(),rand::random::<u32>())}
pub fn database_path()->PathBuf{std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir).join("PinganLocal").join("data.sqlite3")}

pub fn connect(path:&Path)->Result<Connection>{
    if let Some(parent)=path.parent(){std::fs::create_dir_all(parent).map_err(err)?;}
    let db=Connection::open(path).map_err(err)?;
    db.busy_timeout(std::time::Duration::from_secs(10)).map_err(err)?;
    db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,name TEXT NOT NULL,source TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS records(profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(profile_id,kind,id));
    CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY,profile_id TEXT NOT NULL REFERENCES profiles(id),name TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rules(id TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,kind TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS scroll_history(profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,issue INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(profile_id,issue));
    CREATE TABLE IF NOT EXISTS scroll_monitors(profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(profile_id,id));
    PRAGMA user_version=1;").map_err(err)?;
    crate::activity::setup(&db)?;
    db.execute("INSERT OR IGNORE INTO rules VALUES(?1,?2)",params!["default",serde_json::to_string(&default_rule()).map_err(err)?]).map_err(err)?;
    Ok(db)
}

fn setting(db:&Connection,key:&str)->Option<Value>{db.query_row("SELECT value FROM settings WHERE key=?1",[key],|r|r.get::<_,String>(0)).ok().and_then(|s|serde_json::from_str(&s).ok())}
fn put_setting(db:&Connection,key:&str,value:&Value)->Result<()>{db.execute("INSERT INTO settings VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,value.to_string()]).map_err(err)?;Ok(())}
fn event(db:&Connection,kind:&str,message:&str)->Result<()>{db.execute("INSERT INTO events VALUES(?1,?2,?3,?4)",params![id(),kind,message,now()]).map_err(err)?;db.execute("DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY created_at DESC LIMIT 200)",[]).map_err(err)?;Ok(())}
fn records<T:DeserializeOwned>(db:&Connection,pid:&str,kind:&str)->Result<Vec<T>>{let mut q=db.prepare("SELECT data FROM records WHERE profile_id=?1 AND kind=?2 ORDER BY rowid").map_err(err)?;let rows=q.query_map([pid,kind],|r|r.get::<_,String>(0)).map_err(err)?;rows.map(|r|serde_json::from_str(&r.map_err(err)?).map_err(err)).collect()}

pub fn document(db:&Connection,pid:&str)->Result<Document>{
    let name=db.query_row("SELECT name FROM profiles WHERE id=?1",[pid],|r|r.get(0)).map_err(|_|"档案不存在，请重新选择".to_string())?;
    let mut tasks:Vec<Task>=records(db,pid,"task")?;for task in &mut tasks{if !task.period.is_empty()&&task_period(&task.category).is_some_and(|p|p!=task.period){task.done=false;}}
    let mut extras=records::<Value>(db,pid,"extra")?.into_iter().next().unwrap_or(Value::Null);
    for runtime in records::<Value>(db,pid,"runtime")?{if let Some(runtime)=runtime.as_object(){if !extras.is_object(){extras=json!({});}for(key,value)in runtime{extras[key]=value.clone();}}}
    Ok(Document{name,souls:records(db,pid,"soul")?,heroes:records(db,pid,"hero")?,resources:records(db,pid,"resource")?,tasks,guild:records(db,pid,"guild")?,sets:records(db,pid,"set")?,shards:records(db,pid,"shard")?,extras})
}

fn write_document(db:&mut Connection,pid:&str,doc:&Document,source:Option<&str>)->Result<()> {
    let mut doc=doc.clone();for task in &mut doc.tasks{if let Some(period)=task_period(&task.category){if task.period.is_empty(){task.period=period;}}}
    validate(&doc)?;
    let tx=db.transaction().map_err(err)?;
    if let Some(source)=source{tx.execute("INSERT INTO profiles VALUES(?1,?2,?3,?4,?4)",params![pid,doc.name,source,now()]).map_err(err)?;}else{let changed=tx.execute("UPDATE profiles SET name=?1,updated_at=?2 WHERE id=?3",params![doc.name,now(),pid]).map_err(err)?;if changed==0{return Err("档案不存在".into());}}
    tx.execute("DELETE FROM records WHERE profile_id=?1",[pid]).map_err(err)?;
    let collections=[("soul",serde_json::to_value(&doc.souls)),("hero",serde_json::to_value(&doc.heroes)),("resource",serde_json::to_value(&doc.resources)),("task",serde_json::to_value(&doc.tasks)),("guild",serde_json::to_value(&doc.guild)),("set",serde_json::to_value(&doc.sets)),("shard",serde_json::to_value(&doc.shards)),("extra",serde_json::to_value(vec![&doc.extras]))];
    for(kind,items)in collections{for(index,item)in items.map_err(err)?.as_array().ok_or("集合格式错误")?.iter().enumerate(){let key=item.get("id").and_then(Value::as_str).or_else(||item.get("name").and_then(Value::as_str)).map(str::to_string).unwrap_or_else(||index.to_string());tx.execute("INSERT INTO records VALUES(?1,?2,?3,?4)",params![pid,kind,key,item.to_string()]).map_err(err)?;}}
    tx.commit().map_err(err)?;Ok(())
}

fn snapshot(db:&Connection,pid:&str,name:&str)->Result<String>{let doc=document(db,pid)?;let sid=id();db.execute("INSERT INTO snapshots VALUES(?1,?2,?3,?4,?5)",params![sid,pid,name,serde_json::to_string(&doc).map_err(err)?,now()]).map_err(err)?;Ok(sid)}

fn bootstrap(db:&Connection,path:&Path)->Result<Value>{
    let mut q=db.prepare("SELECT id,name,source,created_at,updated_at,(SELECT count(*) FROM records WHERE profile_id=profiles.id AND kind='soul') FROM profiles ORDER BY created_at DESC").map_err(err)?;
    let profiles:Vec<Value>=q.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"source":r.get::<_,String>(2)?,"createdAt":r.get::<_,String>(3)?,"updatedAt":r.get::<_,String>(4)?,"soulCount":r.get::<_,i64>(5)?}))).map_err(err)?.collect::<std::result::Result<_,_>>().map_err(err)?;
    let active=setting(db,"active").and_then(|v|v.as_str().map(str::to_string)).filter(|id|profiles.iter().any(|p|p["id"].as_str()==Some(id))).or_else(||profiles.first().and_then(|p|p["id"].as_str().map(str::to_string)));
    let data=active.as_deref().map(|pid|document(db,pid)).transpose()?;
    let mut q=db.prepare("SELECT data FROM rules ORDER BY rowid").map_err(err)?;let rules:Vec<Value>=q.query_map([],|r|r.get::<_,String>(0)).map_err(err)?.map(|r|serde_json::from_str(&r.map_err(err)?).map_err(err)).collect::<Result<_>>()?;
    let mut q=db.prepare("SELECT kind,message,created_at FROM events ORDER BY created_at DESC LIMIT 30").map_err(err)?;let events:Vec<Value>=q.query_map([],|r|Ok(json!({"kind":r.get::<_,String>(0)?,"message":r.get::<_,String>(1)?,"createdAt":r.get::<_,String>(2)?}))).map_err(err)?.collect::<std::result::Result<_,_>>().map_err(err)?;
    let mut q=db.prepare("SELECT id,profile_id,name,created_at FROM snapshots ORDER BY created_at DESC LIMIT 100").map_err(err)?;let snapshots:Vec<Value>=q.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"profileId":r.get::<_,String>(1)?,"name":r.get::<_,String>(2)?,"createdAt":r.get::<_,String>(3)?}))).map_err(err)?.collect::<std::result::Result<_,_>>().map_err(err)?;
    Ok(json!({"profiles":profiles,"activeId":active,"data":data,"rules":rules,"events":events,"snapshots":snapshots,"catalog":crate::catalog::builtin().heroes,"heroFacts":serde_json::from_str::<Value>(include_str!("../data/hero-facts.json")).map_err(err)?,"skillFacts":serde_json::from_str::<Value>(include_str!("../data/skill-facts.json")).map_err(err)?,"serverNames":serde_json::from_str::<Value>(include_str!("../data/server-names.json")).map_err(err)?,"settings":setting(db,"preferences").unwrap_or(json!({})),"databasePath":path.to_string_lossy(),"version":env!("CARGO_PKG_VERSION")}))
}

fn str_arg<'a>(v:&'a Value,key:&str)->Result<&'a str>{v.get(key).and_then(Value::as_str).ok_or_else(||format!("缺少参数 {key}"))}

fn input_document(db:&Connection,input:&Value)->Result<Document>{
    let pid=str_arg(input,"id")?;
    let scope=&input["viewSnapshot"];
    if scope["profileId"].as_str()==Some(pid) {
        let sid=str_arg(scope,"snapshotId")?;
        let text:String=db.query_row("SELECT data FROM snapshots WHERE id=?1 AND profile_id=?2",params![sid,pid],|r|r.get(0)).map_err(|_|"未找到当前角色的历史版本".to_string())?;
        return serde_json::from_str(&text).map_err(err);
    }
    document(db,pid)
}

pub fn execute(path:&Path,operation:&str,input:Value)->Result<Value>{
    if matches!(operation,"activity_list"|"activity_put"|"activity_update") { return crate::activity::execute(&mut connect(path)?,operation,&input); }
    if !input["viewSnapshot"].is_null() && !matches!(operation,"bootstrap"|"select_profile"|"get_snapshot"|"compare_snapshots"|"export_document"|"optimize"|"association_preview"|"simulate"|"simulate_batch"|"exchange_options"|"simulate_exchange"|"simulate_virtual"|"improvements"|"speed_overview"|"head_tail"|"upgrade_potential"|"hero_panel"|"character_panels"|"lineup_library"|"scroll_state"|"lookup_shards"|"template"|"open_api_status"|"write_file"|"write_workbook"|"write_image_export") {
        return Err("正在只读预览历史版本，请先回到当前档案再修改或读取游戏。".into());
    }
    let mut db=connect(path)?;
    match operation {
        "bootstrap"=>bootstrap(&db,path),
        "open_api_status"=>crate::open_api::status(),
        "configure_open_api"=>{let enabled=input["enabled"].as_bool().ok_or("缺少 API 开关状态")?;let result=crate::open_api::configure(path,enabled)?;put_setting(&db,"open_api",&json!(enabled))?;Ok(result)},
        "select_profile"=>{let pid=str_arg(&input,"id")?;document(&db,pid)?;put_setting(&db,"active",&json!(pid))?;bootstrap(&db,path)},
        "create_demo"=>{let doc=demo::document();let pid=id();write_document(&mut db,&pid,&doc,Some("demo"))?;put_setting(&db,"active",&json!(pid))?;snapshot(&db,&pid,"创建演示档案")?;event(&db,"演示","已创建独立演示档案，所有数据均为合成数据")?;bootstrap(&db,path)},
        "import_document"=>{let doc=importer::parse(str_arg(&input,"text")?,input["name"].as_str().unwrap_or("导入档案"))?;let pid=id();write_document(&mut db,&pid,&doc,Some("json"))?;put_setting(&db,"active",&json!(pid))?;snapshot(&db,&pid,"初次导入")?;event(&db,"导入",&format!("{}：{} 枚御魂、{} 位式神",doc.name,doc.souls.len(),doc.heroes.len()))?;bootstrap(&db,path)},
        "save_document"=>{let pid=str_arg(&input,"id")?;let doc:Document=serde_json::from_value(input["data"].clone()).map_err(err)?;write_document(&mut db,pid,&doc,None)?;event(&db,"编辑",&format!("已更新档案 {} 的本地记录",doc.name))?;bootstrap(&db,path)},
        "set_task_done"=>{let pid=str_arg(&input,"id")?;let doc=document(&db,pid)?;let task_id=str_arg(&input,"taskId")?;let done=input["done"].as_bool().ok_or("缺少任务勾选状态")?;let mut task=if let Some(task)=doc.tasks.into_iter().find(|t|t.id==task_id){task}else{Task{id:task_id.into(),name:str_arg(&input,"name")?.into(),category:str_arg(&input,"category")?.into(),..Task::default()}};task.done=done;task.period=task_period(&task.category).unwrap_or_default();let tx=db.transaction().map_err(err)?;tx.execute("INSERT INTO records VALUES(?1,'task',?2,?3) ON CONFLICT(profile_id,kind,id) DO UPDATE SET data=excluded.data",params![pid,task_id,serde_json::to_string(&task).map_err(err)?]).map_err(err)?;tx.execute("UPDATE profiles SET updated_at=?1 WHERE id=?2",params![now(),pid]).map_err(err)?;tx.commit().map_err(err)?;bootstrap(&db,path)},
        "save_rule"=>{let rule:Rule=serde_json::from_value(input).map_err(err)?;validate_rule(&rule)?;db.execute("INSERT INTO rules VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET data=excluded.data",params![rule.id,serde_json::to_string(&rule).map_err(err)?]).map_err(err)?;event(&db,"规则",&format!("已保存评分标准 {}",rule.name))?;bootstrap(&db,path)},
        "delete_rule"=>{let id=input["id"].as_str().ok_or("缺少评分标准编号")?;if id=="default"{return Err("默认参考标准不能删除".into());}db.execute("DELETE FROM rules WHERE id=?1",[id]).map_err(err)?;bootstrap(&db,path)},
        "optimize"=>{let mut doc=input_document(&db,&input)?;let req:engine::SearchRequest=serde_json::from_value(input["request"].clone()).map_err(err)?;for soul in &mut doc.souls{if soul.initial_substats.is_none(){soul.initial_substats=doc.extras["soulGrowth"][&soul.id]["initial"].as_u64().filter(|n|(2..=4).contains(n)).map(|n|n as u8);}}let result=engine::optimize(&doc.souls,&doc.sets,&req)?;if input["viewSnapshot"].is_null(){event(&db,"计算",&format!("已完成 {} 的面板搜索，检查 {} 个完整候选",doc.name,result["checked"]))?;}Ok(result)},
        "simulate"=>{let doc=input_document(&db,&input)?;let soul=doc.souls.iter().find(|s|s.id==input["soulId"].as_str().unwrap_or("")).ok_or("未找到该御魂")?;crate::upgrade::simulate(soul,input["seed"].as_u64().unwrap_or_else(rand::random))},
        "simulate_batch"=>{let doc=input_document(&db,&input)?;let ids:Vec<String>=serde_json::from_value(input["soulIds"].clone()).map_err(|_|"请选择御魂范围".to_string())?;let seed=input["seed"].as_u64().filter(|n|*n<=9_007_199_254_740_991).ok_or("随机种子需要0–9007199254740991之间的整数")?;let text:String=db.query_row("SELECT data FROM rules WHERE id=?1",[str_arg(&input,"ruleId")?],|r|r.get(0)).map_err(|_|"评分标准不存在，请重新选择".to_string())?;let rule:Rule=serde_json::from_str(&text).map_err(err)?;crate::upgrade::batch(&doc.souls,&ids,seed,str_arg(&input,"model")?,&rule)},
        "exchange_options"=>Ok(crate::exchange::options()),
        "simulate_exchange"=>{let request=serde_json::from_value(input).map_err(|_|"兑换参数格式无效".to_string())?;crate::exchange::generate(request)},
        "simulate_virtual"=>{let souls:Vec<Soul>=serde_json::from_value(input["souls"].clone()).map_err(err)?;let ids:Vec<String>=serde_json::from_value(input["soulIds"].clone()).map_err(err)?;let seed=input["seed"].as_u64().ok_or("随机种子需要非负整数")?;let text:String=db.query_row("SELECT data FROM rules WHERE id=?1",[str_arg(&input,"ruleId")?],|r|r.get(0)).map_err(|_|"评分标准不存在，请重新选择".to_string())?;let rule:Rule=serde_json::from_str(&text).map_err(err)?;crate::exchange::reinforce(&souls,&ids,seed,str_arg(&input,"model")?,&rule)},
        "association_preview"=>{
            let mut doc=input_document(&db,&input)?;
            for soul in &mut doc.souls{if soul.initial_substats.is_none(){soul.initial_substats=doc.extras["soulGrowth"][&soul.id]["initial"].as_u64().filter(|n|(2..=4).contains(n)).map(|n|n as u8);}}
            let pid=str_arg(&input,"id")?;
            let raw:Vec<Value>=if input["viewSnapshot"]["profileId"].as_str()==Some(pid){let sid=str_arg(&input["viewSnapshot"],"snapshotId")?;let text:String=db.query_row("SELECT data FROM snapshots WHERE id=?1 AND profile_id=?2",params![sid,pid],|r|r.get(0)).map_err(err)?;serde_json::from_str::<Value>(&text).map_err(err)?["souls"].as_array().cloned().unwrap_or_default()}else{records(&db,pid,"soul")?};
            let unknown:std::collections::BTreeSet<_>=raw.iter().filter(|s|s.get("innate").is_none()).filter_map(|s|s["id"].as_str()).collect();
            let mut result=crate::association::preview(&doc,&input)?;for row in result["rows"].as_array_mut().ok_or("关联分结果格式错误")?{row["innateKnown"]=json!(!unknown.contains(row["id"].as_str().unwrap_or("")));}Ok(result)
        },
        "improvements"=>{let doc=input_document(&db,&input)?;engine::improvements(&doc,str_arg(&input,"heroId")?,input["metric"].as_str().unwrap_or("damage"),input["keepSets"].as_bool().unwrap_or(true))},
        "speed_overview"=>{let doc=input_document(&db,&input)?;engine::speed_overview(&doc.souls,&doc.sets,input["onlyMax"].as_bool().unwrap_or(true))},
        "head_tail"=>{let doc=input_document(&db,&input)?;crate::upgrade::head_tail(&doc.souls,input["metric"].as_str().unwrap_or("speed"))},
        "upgrade_potential"=>{let doc=input_document(&db,&input)?;let soul=doc.souls.iter().find(|s|s.id==input["soulId"].as_str().unwrap_or("")).ok_or("未找到该御魂")?;crate::upgrade::potential(soul)},
        "get_snapshot"=>{let pid=str_arg(&input,"id")?;let sid=str_arg(&input,"snapshotId")?;let text:String=db.query_row("SELECT data FROM snapshots WHERE id=?1 AND profile_id=?2",params![sid,pid],|r|r.get(0)).map_err(|_|"未找到当前角色的历史版本".to_string())?;let raw:Value=serde_json::from_str(&text).map_err(err)?;let doc:Document=serde_json::from_value(raw.clone()).map_err(err)?;let mut output=serde_json::to_value(doc).map_err(err)?;if let (Some(old),Some(souls))=(raw["souls"].as_array(),output["souls"].as_array_mut()){for (original,soul) in old.iter().zip(souls){if original.get("innate").is_none(){soul.as_object_mut().unwrap().remove("innate");}}}Ok(output)},
        "snapshot"=>{let pid=str_arg(&input,"id")?;snapshot(&db,pid,input["name"].as_str().filter(|s|!s.trim().is_empty()).unwrap_or("手动快照"))?;event(&db,"快照","已保存完整档案快照")?;bootstrap(&db,path)},
        "compare_snapshots"=>{let a:String=db.query_row("SELECT data FROM snapshots WHERE id=?1",[str_arg(&input,"a")?],|r|r.get(0)).map_err(err)?;let b:String=db.query_row("SELECT data FROM snapshots WHERE id=?1",[str_arg(&input,"b")?],|r|r.get(0)).map_err(err)?;let a:Document=serde_json::from_str(&a).map_err(err)?;let b:Document=serde_json::from_str(&b).map_err(err)?;let old:std::collections::HashMap<_,_>=a.souls.iter().map(|s|(&s.id,s)).collect();let new:std::collections::HashMap<_,_>=b.souls.iter().map(|s|(&s.id,s)).collect();let added:Vec<_>=b.souls.iter().filter(|s|!old.contains_key(&s.id)).collect();let removed:Vec<_>=a.souls.iter().filter(|s|!new.contains_key(&s.id)).collect();let changed:Vec<_>=b.souls.iter().filter(|s|old.get(&s.id).is_some_and(|prev|serde_json::to_value(prev).ok()!=serde_json::to_value(s).ok())).collect();Ok(json!({"from":a.name,"to":b.name,"added":added,"removed":removed,"changed":changed,"heroDelta":b.heroes.len() as i64-a.heroes.len() as i64}))},
        "restore_snapshot"=>{let sid=str_arg(&input,"snapshotId")?;let(pid,text):(String,String)=db.query_row("SELECT profile_id,data FROM snapshots WHERE id=?1",[sid],|r|Ok((r.get(0)?,r.get(1)?))).map_err(err)?;let doc:Document=serde_json::from_str(&text).map_err(err)?;snapshot(&db,&pid,"恢复前自动备份")?;write_document(&mut db,&pid,&doc,None)?;put_setting(&db,"active",&json!(pid))?;event(&db,"恢复","已恢复快照，并自动保存恢复前备份")?;bootstrap(&db,path)},
        "export_document"=>{let doc=input_document(&db,&input)?;Ok(json!({"schema":"pingan-local/1","exportedAt":now(),"data":doc}))},
        "template"=>Ok(json!({"schema":"pingan-local/1","data":{"name":"我的角色","souls":[{"id":"soul-001","set":"自定义套装","slot":2,"quality":6,"level":15,"main":"speed","value":57.0,"sub":{"crit":8.1,"attack_pct":5.4,"hp":103.0,"defense":5.0},"locked":false,"equipped":"","initialSubstats":4}],"heroes":[{"id":"hero-001","name":"自定义式神","rarity":"SSR","level":40,"star":6,"awakened":true,"shards":0,"base":{"attack":3000,"hp":12000,"defense":450,"speed":110,"crit":10,"crit_damage":150}}],"sets":[{"name":"自定义套装","twoPiece":{"crit":15}}],"resources":[],"tasks":[],"guild":[]}})),
        "game_processes"=>crate::bridge::processes(),
        "emulator_devices"=>crate::emulator::devices(str_arg(&input,"root")?),
        "emulator_probe"=>crate::emulator::probe(str_arg(&input,"root")?,str_arg(&input,"serial")?,input["enableRoot"].as_bool().unwrap_or(false)),
        "hero_panel"=>{let doc=input_document(&db,&input)?;let hero=doc.heroes.iter().find(|h|h.id==input["heroId"].as_str().unwrap_or("")).ok_or("未找到该式神")?;let incomplete=["attack","hp","defense","speed","crit","crit_damage"].iter().any(|k|!hero.base.contains_key(*k));let souls:Vec<_>=doc.souls.iter().filter(|s|s.equipped==hero.id).collect();Ok(json!({"panel":engine::panel_with_bonus(&souls,&hero.base,&hero.bonus,&doc.sets),"incomplete":incomplete,"equipped":souls,"bonus":hero.bonus}))},
        "character_panels"=>{let doc=input_document(&db,&input)?;Ok(json!(doc.heroes.iter().map(|hero|{let souls:Vec<_>=doc.souls.iter().filter(|s|s.equipped==hero.id).collect();let incomplete=["attack","hp","defense","speed","crit","crit_damage"].iter().any(|k|!hero.base.contains_key(*k));json!({"heroId":hero.id,"panel":engine::panel_with_bonus(&souls,&hero.base,&hero.bonus,&doc.sets),"incomplete":incomplete,"ids":souls.iter().map(|s|&s.id).collect::<Vec<_>>()})}).collect::<Vec<_>>()))},
        "preview_cbg"=>{let(doc,warnings)=crate::cbg::fetch(str_arg(&input,"url")?)?;Ok(json!({"data":doc,"warnings":warnings}))},
        "import_cbg"=>{let url=str_arg(&input,"url")?;let(server,sn)=crate::cbg::identity(url)?;let doc:Document=serde_json::from_value(input["data"].clone()).map_err(err)?;validate(&doc)?;let pid=id();write_document(&mut db,&pid,&doc,Some(&format!("cbg:{server}:{sn}")))?;put_setting(&db,"active",&json!(pid))?;snapshot(&db,&pid,"藏宝阁公开快照")?;event(&db,"导入",&format!("已导入藏宝阁公开快照：{} 枚御魂、{} 位式神",doc.souls.len(),doc.heroes.len()))?;bootstrap(&db,path)},
        "read_desktop"|"read_emulator"=>{
            let pid=u32::try_from(input["pid"].as_u64().ok_or("缺少进程 ID")?).map_err(|_|"进程 ID 无效")?;
            let raw=if operation=="read_emulator"{crate::game_memory::capture_android(str_arg(&input,"root")?,str_arg(&input,"serial")?,pid,false)?}else{crate::game_memory::capture(pid)?};let(mut doc,warnings)=crate::game_convert::convert(&raw)?;
            let identity=&raw["player"];let source=if !identity["short_id"].is_null()&&!identity["server_id"].is_null(){format!("game:{}:{}",identity["server_id"],identity["short_id"])}else{format!("game:{}",id())};
            let previous:Option<String>=db.query_row("SELECT id FROM profiles WHERE source=?1",[&source],|r|r.get(0)).ok();
            let profile=previous.clone().unwrap_or_else(id);
            if previous.is_some(){
                let saved=document(&db,&profile)?;doc.tasks=saved.tasks;if doc.guild.is_empty(){doc.guild=saved.guild;}
                let existing:std::collections::HashSet<_>=doc.resources.iter().map(|r|r.name.clone()).collect();doc.resources.extend(saved.resources.into_iter().filter(|r|!r.name.contains(" · #")&&!existing.contains(&r.name)));
                doc.heroes.extend(saved.heroes.into_iter().filter(|h|h.id.starts_with("local-")));
                snapshot(&db,&profile,"再次读取前自动备份")?;
            }
            write_document(&mut db,&profile,&doc,if previous.is_some(){None}else{Some(&source)})?;
            put_setting(&db,"active",&json!(profile))?;
            snapshot(&db,&profile,"独立读取游戏快照")?;
            event(&db,"读取",&format!("已只读采集 {} 枚御魂、{} 位式神、{} 项资产",doc.souls.len(),doc.heroes.len(),doc.resources.len()))?;
            Ok(json!({"state":bootstrap(&db,path)?,"warnings":warnings}))
        },
        "refresh_runtime"=>{
            let profile=str_arg(&input,"id")?;
            let pid=u32::try_from(input["pid"].as_u64().ok_or("缺少进程 ID")?).map_err(|_|"进程 ID 无效")?;
            let saved=document(&db,profile)?;let emulator=&saved.extras["capture"]["reader"]["emulator"];
            let raw=if let(Some(root),Some(serial))=(emulator["root"].as_str(),emulator["serial"].as_str()){let current=crate::emulator::runtime_pid(root,serial,pid)?;crate::game_memory::capture_android(root,serial,current,true)?}else{crate::game_memory::capture_runtime(pid)?};
            let source:String=db.query_row("SELECT source FROM profiles WHERE id=?1",[profile],|r|r.get(0)).map_err(err)?;
            let identity=&raw["player"];if identity["server_id"].is_null()||identity["short_id"].is_null()||source!=format!("game:{}:{}",identity["server_id"],identity["short_id"]){return Err("运行中的游戏角色与当前档案不一致，请到数据读取页重新读取".into());}
            let runtime=json!({"realmStatus":crate::realm::status(&raw),"guildSnapshot":crate::realm::guild(&raw),"scrollSnapshot":crate::scroll::snapshot(&raw),"taskSnapshot":crate::game_convert::task_snapshot(&raw)});
            db.execute("INSERT INTO records VALUES(?1,'runtime','live',?2) ON CONFLICT(profile_id,kind,id) DO UPDATE SET data=excluded.data",params![profile,runtime.to_string()]).map_err(err)?;bootstrap(&db,path)
        },
        "scroll_state"|"save_scroll_monitor"|"delete_scroll_monitor"|"evaluate_scroll_monitors"=>{let saved=input_document(&db,&input)?;crate::scroll::execute(&db,operation,&input,&saved.extras["scrollSnapshot"])},
        "lineup_library"=>Ok(json!({"public":setting(&db,"lineups_public").unwrap_or(json!({"teams":[],"updatedAt":null})),"custom":setting(&db,"lineups_custom").unwrap_or(json!([]))})),
        "refresh_lineups"=>{let teams=crate::lineups::fetch_public()?;let data=json!({"teams":teams,"updatedAt":now(),"sourceUrl":crate::lineups::SOURCE});put_setting(&db,"lineups_public",&data)?;Ok(data)},
        "save_lineup"=>{let mut team:crate::lineups::Lineup=serde_json::from_value(input).map_err(|_|"阵容数据格式无效".to_string())?;if team.id.is_empty(){team.id=format!("local:{}",id());}if !team.id.starts_with("local:"){return Err("只能编辑自己的阵容；公开方案请另存为本地副本".into());}crate::lineups::validate(&team)?;let mut teams:Vec<crate::lineups::Lineup>=serde_json::from_value(setting(&db,"lineups_custom").unwrap_or(json!([]))).map_err(err)?;if let Some(existing)=teams.iter_mut().find(|t|t.id==team.id){*existing=team;}else{if teams.len()>=2000{return Err("本地阵容最多保存 2000 条".into());}teams.push(team);}put_setting(&db,"lineups_custom",&json!(teams))?;Ok(json!(teams))},
        "delete_lineup"=>{let target=str_arg(&input,"id")?;let mut teams:Vec<crate::lineups::Lineup>=serde_json::from_value(setting(&db,"lineups_custom").unwrap_or(json!([]))).map_err(err)?;let count=teams.len();teams.retain(|t|t.id!=target);if teams.len()==count{return Err("本地阵容不存在，请刷新后重试".into());}put_setting(&db,"lineups_custom",&json!(teams))?;Ok(json!(teams))},
        "save_settings"=>{put_setting(&db,"preferences",&input)?;bootstrap(&db,path)},
        "lookup_shards"=>{let query=input["query"].as_str().unwrap_or("").to_lowercase();let mut q=db.prepare("SELECT p.name,p.source,r.kind,r.data FROM records r JOIN profiles p ON p.id=r.profile_id WHERE r.kind='shard' OR (r.kind='hero' AND NOT EXISTS(SELECT 1 FROM records s WHERE s.profile_id=r.profile_id AND s.kind='shard')) ORDER BY p.name").map_err(err)?;let mut result=vec![];let rows=q.query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?))).map_err(err)?;for row in rows{let(profile,source,kind,data)=row.map_err(err)?;let(id,name,quantity)=if kind=="shard"{let s:ShardRecord=serde_json::from_str(&data).map_err(err)?;(s.id,s.name,s.quantity)}else{let h:Hero=serde_json::from_str(&data).map_err(err)?;(h.id,h.name,h.shards)};if query.is_empty()||name.to_lowercase().contains(&query){result.push(json!({"profile":profile,"source":source,"name":name,"shards":quantity,"id":id}));}}Ok(json!(result))},
        "simulate_summon"=>{use rand::{Rng,SeedableRng};let count=input["count"].as_u64().unwrap_or(100);let probability=input["probability"].as_f64().unwrap_or(0.01);if count==0||count>100000||!(0.0..=1.0).contains(&probability){return Err("模拟次数应为 1–100000，概率应为 0–1".into());}let seed=input["seed"].as_u64().unwrap_or(42);let mut rng=rand::rngs::StdRng::seed_from_u64(seed);let mut hits=vec![];let(mut gap,mut longest)=(0,0);for i in 1..=count{if rng.gen_bool(probability){hits.push(i);gap=0;}else{gap+=1;longest=longest.max(gap);}}Ok(json!({"count":count,"hits":hits.len(),"positions":hits.iter().take(200).collect::<Vec<_>>(),"longestFailure":longest,"seed":seed,"probability":probability}))},
        "game_windows"=>crate::game_windows::list(),
        "arrange_game_windows"=>crate::game_windows::arrange(&input),
        "launch_game"=>{let path=PathBuf::from(str_arg(&input,"path")?);if !path.is_absolute()||!path.is_file()||path.extension().is_none_or(|x|!x.eq_ignore_ascii_case("exe")){return Err("请选择存在的 Windows .exe 文件绝对路径".into());}let mut command=std::process::Command::new(&path);if let Some(parent)=path.parent(){command.current_dir(parent);}let child=command.spawn().map_err(|e|format!("启动失败：{e}"))?;event(&db,"启动","已按指定路径启动游戏；未进行账号隔离或绕过单实例限制")?;Ok(json!({"pid":child.id()}))},
        "write_workbook"=>{let path=Path::new(str_arg(&input,"path")?);if path.extension().and_then(|s|s.to_str()).is_none_or(|s|!s.eq_ignore_ascii_case("xlsx")){return Err("仅允许导出 .xlsx 工作簿".into());}let bytes:Vec<u8>=serde_json::from_value(input["bytes"].clone()).map_err(|_|"工作簿字节格式无效")?;if bytes.len()>64*1024*1024{return Err("导出工作簿超过 64 MB".into());}if !bytes.starts_with(b"PK\x03\x04"){return Err("工作簿格式无效".into());}std::fs::write(path,bytes).map_err(err)?;Ok(json!({"saved":true}))},
        "read_file"=>{let p=PathBuf::from(str_arg(&input,"path")?);let meta=std::fs::metadata(&p).map_err(err)?;if meta.len()>64*1024*1024{return Err("文件超过 64 MB".into());}Ok(json!(std::fs::read_to_string(p).map_err(err)?))},
        "write_image_export"=>crate::image_export::write(&input),
        "write_file"=>{let p=str_arg(&input,"path")?;let content=str_arg(&input,"content")?;if content.len()>64*1024*1024{return Err("导出文件超过 64 MB".into());}let original=Path::new(p);if original.extension().is_none_or(|x|x!="json"&&x!="csv"){return Err("仅允许导出 .json 或 .csv 文件".into());}std::fs::write(original,content).map_err(err)?;Ok(json!({"saved":true}))},
        _=>Err(format!("未知操作：{operation}"))
    }
}

#[cfg(test)]
mod tests{
    #[test]fn snapshot_preserves_unrecorded_innate_in_legacy_source(){
        use super::*;let path=std::env::temp_dir().join(format!("pingan-legacy-{}.sqlite3",id()));let state=execute(&path,"create_demo",json!({})).unwrap();let pid=state["activeId"].as_str().unwrap();let sid=state["snapshots"][0]["id"].as_str().unwrap();let mut raw=state["data"].clone();raw["souls"][0].as_object_mut().unwrap().remove("innate");raw["souls"][1]["innate"]=json!({});connect(&path).unwrap().execute("UPDATE snapshots SET data=?1 WHERE id=?2",params![raw.to_string(),sid]).unwrap();let result=execute(&path,"get_snapshot",json!({"id":pid,"snapshotId":sid})).unwrap();assert!(result["souls"][0].get("innate").is_none());assert_eq!(result["souls"][1]["innate"],json!({}));let estimate=execute(&path,"association_preview",json!({"id":pid,"viewSnapshot":{"profileId":pid,"snapshotId":sid},"metric":"crit","base":{},"minimums":{},"contextIds":[],"includeThree":true})).unwrap();let rows=estimate["rows"].as_array().unwrap();assert_eq!(rows.iter().find(|r|r["id"]==raw["souls"][0]["id"]).unwrap()["innateKnown"],false);assert_eq!(rows.iter().find(|r|r["id"]==raw["souls"][1]["id"]).unwrap()["innateKnown"],true);assert_eq!(estimate["includeThree"],true);let _=std::fs::remove_file(path);
    }
    use super::*;
    #[test]fn workbook_export_preserves_bytes_and_rejects_invalid_targets(){
        let path=std::env::temp_dir().join(format!("pingan-xlsx-{}.sqlite3",id()));let workbook=path.with_extension("xlsx");let forbidden=path.with_extension("exe");let bytes=vec![80_u8,75,3,4,0,255,128,10];
        assert!(execute(&path,"write_workbook",json!({"path":forbidden,"bytes":bytes})).is_err());assert!(!forbidden.exists());
        assert!(execute(&path,"write_workbook",json!({"path":workbook,"bytes":[80,75,300]})).is_err());assert!(!workbook.exists());
        assert!(execute(&path,"write_workbook",json!({"path":workbook,"bytes":[1,2,3,4]})).is_err());assert!(!workbook.exists());
        execute(&path,"write_workbook",json!({"path":workbook,"bytes":bytes})).unwrap();assert_eq!(std::fs::read(&workbook).unwrap(),bytes);
        let _=std::fs::remove_file(workbook);let _=std::fs::remove_file(&path);let _=std::fs::remove_file(path.with_extension("sqlite3-wal"));let _=std::fs::remove_file(path.with_extension("sqlite3-shm"));
    }

    #[test]fn historical_analysis_and_exports_use_saved_document_without_writes(){
        let path=std::env::temp_dir().join(format!("pingan-history-{}.sqlite3",id()));
        let first=execute(&path,"create_demo",json!({})).unwrap();
        let pid=first["activeId"].as_str().unwrap();let sid=first["snapshots"][0]["id"].as_str().unwrap();
        let mut edited=first["data"].clone();edited["name"]=json!("live edited");edited["souls"]=json!([]);edited["heroes"]=json!([]);
        execute(&path,"save_document",json!({"id":pid,"data":edited})).unwrap();
        let before=execute(&path,"bootstrap",json!({})).unwrap();
        let scope=json!({"profileId":pid,"snapshotId":sid});
        let old=execute(&path,"export_document",json!({"id":pid,"viewSnapshot":scope})).unwrap();
        assert_eq!(old["data"],first["data"]);
        let panels=execute(&path,"character_panels",json!({"id":pid,"viewSnapshot":scope})).unwrap();assert_eq!(panels.as_array().unwrap().len(),first["data"]["heroes"].as_array().unwrap().len());
        assert_eq!(execute(&path,"character_panels",json!({"id":pid})).unwrap(),json!([]));
        assert!(execute(&path,"head_tail",json!({"id":pid,"viewSnapshot":scope})).is_ok());
        let selected:Vec<_>=first["data"]["souls"].as_array().unwrap().iter().filter(|s|s["quality"]==6&&s["level"]==0).map(|s|s["id"].clone()).collect();assert!(!selected.is_empty());
        let batch=execute(&path,"simulate_batch",json!({"id":pid,"viewSnapshot":scope,"soulIds":selected,"seed":42,"model":"reinforced","ruleId":"default"})).unwrap();assert_eq!(batch["rows"].as_array().unwrap().len(),selected.len());
        assert!(execute(&path,"simulate_batch",json!({"id":pid,"soulIds":selected,"seed":42,"model":"reinforced","ruleId":"default"})).is_err());
        assert!(execute(&path,"simulate_batch",json!({"id":pid,"viewSnapshot":scope,"soulIds":selected,"seed":-1,"model":"uniform","ruleId":"default"})).is_err());
        for op in ["save_document","set_task_done","save_settings","snapshot","restore_snapshot","read_desktop","read_emulator","refresh_runtime","save_scroll_monitor","evaluate_scroll_monitors","create_demo","save_lineup"] {
            let error=execute(&path,op,json!({"id":pid,"snapshotId":sid,"viewSnapshot":scope,"data":first["data"]})).unwrap_err();assert!(error.contains("只读"),"{op}: {error}");
        }
        assert!(execute(&path,"export_document",json!({"id":pid,"viewSnapshot":{"profileId":pid,"snapshotId":"missing"}})).is_err());
        let after=execute(&path,"bootstrap",json!({})).unwrap();assert_eq!(after,before);
        let other=execute(&path,"create_demo",json!({})).unwrap();let other_id=other["activeId"].as_str().unwrap();
        assert!(execute(&path,"export_document",json!({"id":other_id,"viewSnapshot":{"profileId":other_id,"snapshotId":sid}})).is_err());
        assert_eq!(execute(&path,"export_document",json!({"id":other_id,"viewSnapshot":scope})).unwrap()["data"],other["data"]);
        let _=std::fs::remove_file(path);
    }

    #[test]fn snapshot_preview_never_restores_or_switches_profile(){
        let path=std::env::temp_dir().join(format!("pingan-preview-{}.sqlite3",id()));
        let first=execute(&path,"create_demo",json!({})).unwrap();let pid=first["activeId"].as_str().unwrap();let sid=first["snapshots"][0]["id"].as_str().unwrap();
        let mut edited:Document=serde_json::from_value(first["data"].clone()).unwrap();edited.name="current edited name".into();execute(&path,"save_document",json!({"id":pid,"data":edited})).unwrap();
        let second=execute(&path,"create_demo",json!({})).unwrap();let other=second["activeId"].as_str().unwrap();
        let preview=execute(&path,"get_snapshot",json!({"id":pid,"snapshotId":sid})).unwrap();assert_ne!(preview["name"],"current edited name");
        assert!(execute(&path,"get_snapshot",json!({"id":other,"snapshotId":sid})).is_err());
        let current=execute(&path,"bootstrap",json!({})).unwrap();assert_eq!(current["activeId"],other);assert_eq!(current["snapshots"],second["snapshots"]);assert_eq!(current["events"],second["events"]);
        let saved=execute(&path,"export_document",json!({"id":pid})).unwrap();assert_eq!(saved["data"]["name"],"current edited name");
        let _=std::fs::remove_file(&path);let _=std::fs::remove_file(path.with_extension("sqlite3-wal"));let _=std::fs::remove_file(path.with_extension("sqlite3-shm"));
    }
    #[test]fn runtime_overlay_preserves_inventory_and_manual_records_and_survives_edit(){
        let mut db=Connection::open_in_memory().unwrap();db.execute_batch("CREATE TABLE profiles(id TEXT PRIMARY KEY,name TEXT,source TEXT,created_at TEXT,updated_at TEXT);CREATE TABLE records(profile_id TEXT,kind TEXT,id TEXT,data TEXT,PRIMARY KEY(profile_id,kind,id));").unwrap();
        let mut doc=demo::document();doc.extras=json!({"realmStatus":{"foster":"old"},"other":"retained"});write_document(&mut db,"test",&doc,Some("test")).unwrap();
        db.execute("INSERT INTO records VALUES('test','runtime','live',?1)",[json!({"realmStatus":{"foster":null},"guildSnapshot":{"members":[]}}).to_string()]).unwrap();
        let mut merged=document(&db,"test").unwrap();assert_eq!(merged.souls.len(),doc.souls.len());assert_eq!(merged.tasks.len(),doc.tasks.len());assert_eq!(merged.extras["other"],"retained");assert!(merged.extras["realmStatus"]["foster"].is_null());
        merged.name="edited".into();write_document(&mut db,"test",&merged,None).unwrap();let saved=document(&db,"test").unwrap();assert_eq!(saved.extras,merged.extras);assert_eq!(saved.guild.len(),doc.guild.len());
    }
    #[test]fn import_is_validated_before_writing_and_survives_reopen(){let path=std::env::temp_dir().join(format!("pingan-test-{}.sqlite3",id()));let s=execute(&path,"create_demo",json!({})).unwrap();let pid=s["activeId"].as_str().unwrap();assert_eq!(s["data"]["souls"].as_array().unwrap().len(),240);let before=s["profiles"].as_array().unwrap().len();assert!(execute(&path,"import_document",json!({"text":"{\"souls\":[{\"id\":\"bad\",\"slot\":0}]}"})).is_err());let reread=execute(&path,"bootstrap",json!({})).unwrap();assert_eq!(reread["profiles"].as_array().unwrap().len(),before);let export=execute(&path,"export_document",json!({"id":pid})).unwrap();assert_eq!(export["schema"],"pingan-local/1");execute(&path,"import_document",json!({"text":export.to_string()})).unwrap();assert_eq!(execute(&path,"bootstrap",json!({})).unwrap()["profiles"].as_array().unwrap().len(),2);drop(s);let _=std::fs::remove_file(&path);let _=std::fs::remove_file(path.with_extension("sqlite3-wal"));let _=std::fs::remove_file(path.with_extension("sqlite3-shm"));}
    #[test]fn recurring_tasks_reset_on_read_and_manual_check_uses_current_period(){
        let mut db=Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE profiles(id TEXT PRIMARY KEY,name TEXT,source TEXT,created_at TEXT,updated_at TEXT); CREATE TABLE records(profile_id TEXT,kind TEXT,id TEXT,data TEXT,PRIMARY KEY(profile_id,kind,id));").unwrap();
        let mut doc=Document{name:"period test".into(),tasks:vec![Task{id:"daily".into(),name:"daily".into(),done:true,category:"日常".into(),period:"2000-01-01".into()},Task{id:"custom".into(),name:"custom".into(),done:true,category:"自定义".into(),period:String::new()}],..Document::default()};
        write_document(&mut db,"test",&doc,Some("test")).unwrap();let read=document(&db,"test").unwrap();assert!(!read.tasks[0].done);assert!(read.tasks[1].done);
        doc.tasks[0].period=task_period("日常").unwrap();write_document(&mut db,"test",&doc,None).unwrap();assert!(document(&db,"test").unwrap().tasks[0].done);
    }
    #[test]fn unknown_json_is_not_silently_imported(){assert!(importer::parse("{\"unrelated\":true}","test").is_err());}
    #[test]fn stale_document_edit_cannot_carry_task_completion_into_a_new_period(){
        let path=std::env::temp_dir().join(format!("pingan-task-period-{}.sqlite3",id()));
        let state=execute(&path,"create_demo",json!({})).unwrap();let pid=state["activeId"].as_str().unwrap();
        let mut data=state["data"].clone();data["tasks"]=json!([{"id":"old","name":"old","done":true,"category":"日常","period":"2000-01-01"}]);
        let saved=execute(&path,"save_document",json!({"id":pid,"data":data})).unwrap();assert_eq!(saved["data"]["tasks"][0]["done"],false);
        let marked=execute(&path,"set_task_done",json!({"id":pid,"taskId":"old","done":true})).unwrap();assert_eq!(marked["data"]["tasks"][0]["done"],true);assert_eq!(marked["data"]["tasks"][0]["period"],task_period("日常").unwrap());
        let _=std::fs::remove_file(&path);
    }
}
