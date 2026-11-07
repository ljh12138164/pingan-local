//! Optional loopback-only, authenticated, read-only player data API.
use serde_json::{json,Value};
use std::{path::{Path,PathBuf},sync::{Mutex,Arc,atomic::{AtomicBool,Ordering}},time::{Duration,Instant},net::{TcpListener,TcpStream,Shutdown},io::{Read,Write,ErrorKind}};
use rusqlite::{Connection,OpenFlags};
type Result<T>=std::result::Result<T,String>;
struct Running{path:PathBuf,url:String,token:String,alive:Arc<AtomicBool>}
static API:Mutex<Option<Running>>=Mutex::new(None);
pub fn status()->Result<Value>{let state=API.lock().map_err(|_|"开放 API 状态不可用")?;Ok(match state.as_ref(){Some(s)=>json!({"enabled":true,"url":s.url,"token":s.token}),None=>json!({"enabled":false})})}
pub fn configure(path:&Path,enabled:bool)->Result<Value>{
    let mut state=API.lock().map_err(|_|"开放 API 状态不可用")?;
    if state.as_ref().is_some_and(|s|enabled&&s.path==path){drop(state);return status();}
    let next=if enabled{
        let server=TcpListener::bind("127.0.0.1:0").map_err(|e|format!("开放 API 启动失败：{e}"))?;server.set_nonblocking(true).map_err(|e|e.to_string())?;
        let address=server.local_addr().map_err(|e|e.to_string())?;let url=format!("http://{address}");
        let token=rand::random::<[u8;32]>().iter().map(|b|format!("{b:02x}")).collect::<String>();
        let alive=Arc::new(AtomicBool::new(true));let running=Running{path:path.to_owned(),url,token:token.clone(),alive:alive.clone()};let path=path.to_owned();
        std::thread::spawn(move||while alive.load(Ordering::Relaxed){
            match server.accept(){Ok((stream,_))=>serve(stream,&path,&token,&alive),Err(e)if e.kind()==ErrorKind::WouldBlock=>std::thread::sleep(Duration::from_millis(50)),Err(_)=>break};
        });Some(running)
    }else{None};
    if let Some(previous)=state.take(){previous.alive.store(false,Ordering::Relaxed);}*state=next;drop(state);status()
}
pub fn restore(path:&Path)->Result<()>{let db=crate::store::connect(path)?;let enabled=db.query_row("SELECT value FROM settings WHERE key='open_api'",[],|r|r.get::<_,String>(0)).ok().is_some_and(|s|s=="true");configure(path,enabled)?;Ok(())}
// One bounded request per connection. Closing each response also closes existing
// clients cleanly when the user disables the API; no keep-alive workers survive.
fn serve(mut stream:TcpStream,path:&Path,token:&str,alive:&AtomicBool){
    stream.set_read_timeout(Some(Duration::from_millis(200))).ok();stream.set_write_timeout(Some(Duration::from_secs(3))).ok();
    let start=Instant::now();let mut bytes=Vec::new();let mut chunk=[0;1024];
    while !bytes.windows(4).any(|w|w==b"\r\n\r\n"){
        if !alive.load(Ordering::Relaxed)||start.elapsed()>Duration::from_secs(2)||bytes.len()>8192{return;}
        match stream.read(&mut chunk){Ok(0)=>return,Ok(n)=>bytes.extend_from_slice(&chunk[..n]),Err(e)if matches!(e.kind(),ErrorKind::WouldBlock|ErrorKind::TimedOut)=>continue,Err(_)=>return}
    }
    let result=(||->Result<(u16,Value)>{
        let header=std::str::from_utf8(&bytes).map_err(|_|"HTTP 请求编码无效")?;let mut lines=header.split("\r\n");let first:Vec<_>=lines.next().unwrap_or("").split_whitespace().collect();
        if first.len()!=3||!["HTTP/1.0","HTTP/1.1"].contains(&first[2]){return Ok((400,json!({"error":"HTTP 请求无效"})));}
        let mut auth=None;for line in lines.take_while(|line|!line.is_empty()){
            let Some((name,value))=line.split_once(':')else{return Ok((400,json!({"error":"HTTP 请求头无效"})));};
            if name.eq_ignore_ascii_case("Authorization"){if auth.is_some(){return Ok((400,json!({"error":"认证头重复"})));}auth=Some(value.trim());}
        }
        answer(path,token,first[0],first[1],auth)
    })();
    let(code,body)=result.unwrap_or_else(|e|(500,json!({"error":e})));let body=body.to_string();let header=format!("HTTP/1.1 {code} Response\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n",body.len());
    stream.write_all(header.as_bytes()).and_then(|_|stream.write_all(body.as_bytes())).ok();stream.shutdown(Shutdown::Both).ok();
}
fn answer(path:&Path,token:&str,method:&str,url:&str,auth:Option<&str>)->Result<(u16,Value)>{
    let expected=format!("Bearer {token}");if auth!=Some(expected.as_str()){return Ok((401,json!({"error":"需要本机 API Bearer 凭证"})));}
    if method!="GET"{return Ok((405,json!({"error":"开放 API 仅支持 GET 读取"})));}
    if url.len()>2048||!url.starts_with('/'){return Ok((400,json!({"error":"请求路径无效"})));}
    let url=reqwest::Url::parse(&format!("http://127.0.0.1{url}")).map_err(|_|"请求路径无效")?;
    let parts:Vec<_>=url.path().trim_matches('/').split('/').collect();
    if parts==["v1","status"]{return Ok((200,json!({"version":env!("CARGO_PKG_VERSION"),"readOnly":true})));}
    let db=Connection::open_with_flags(path,OpenFlags::SQLITE_OPEN_READ_ONLY|OpenFlags::SQLITE_OPEN_NO_MUTEX).map_err(|e|e.to_string())?;db.busy_timeout(Duration::from_secs(3)).map_err(|e|e.to_string())?;
    if parts==["v1","profiles"]{
        let mut query=db.prepare("SELECT id,name,source,updated_at FROM profiles ORDER BY created_at DESC").map_err(|e|e.to_string())?;
        let rows=query.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"source":r.get::<_,String>(2)?,"updatedAt":r.get::<_,String>(3)?}))).map_err(|e|e.to_string())?.collect::<std::result::Result<Vec<_>,_>>().map_err(|e|e.to_string())?;return Ok((200,json!({"profiles":rows})));
    }
    let (profile,section)=match parts.as_slice(){
        ["v1","active",tail @ ..]=>{
            let active=db.query_row("SELECT value FROM settings WHERE key='active'",[],|r|r.get::<_,String>(0)).ok().and_then(|s|serde_json::from_str::<String>(&s).ok());
            let Some(active)=active else{return Ok((404,json!({"error":"尚未选择档案"})));};(active,tail.first().copied().unwrap_or("document"))
        },
        ["v1","profiles",id,tail @ ..] if !id.is_empty()=>(id.to_string(),tail.first().copied().unwrap_or("document")),
        _=>return Ok((404,json!({"error":"接口不存在"}))),
    };
    if (parts.get(1)==Some(&"active")&&parts.len()>3)||(parts.get(1)==Some(&"profiles")&&parts.len()>4){return Ok((404,json!({"error":"接口不存在"})));}
    if !["document","summary","souls","heroes","shards","resources","tasks","guild","realm"].contains(&section){return Ok((404,json!({"error":"接口不存在"})));}
    let doc=match crate::store::document(&db,&profile){Ok(d)=>d,Err(_)=>return Ok((404,json!({"error":"档案不存在"})))};
    let body=match section{
        "summary"=>json!({"name":doc.name,"souls":doc.souls.len(),"heroes":doc.heroes.len(),"shards":doc.shards.len(),"resources":doc.resources.len(),"reader":doc.extras["capture"]["reader"]}),
        "guild"=>doc.extras["guildSnapshot"].clone(),"realm"=>doc.extras["realmStatus"].clone(),
        "document"=>serde_json::to_value(&doc).map_err(|e|e.to_string())?,
        collection=>{
            let data=serde_json::to_value(&doc).map_err(|e|e.to_string())?;let rows=data[collection].as_array().ok_or("数据集合无效")?;
            let mut offset=0usize;let mut limit=500usize;for(k,v)in url.query_pairs(){if k=="offset"{offset=v.parse().unwrap_or(0);}if k=="limit"{limit=v.parse::<usize>().unwrap_or(500).clamp(1,1000);}}
            json!({"total":rows.len(),"offset":offset,"limit":limit,"items":rows.iter().skip(offset).take(limit).collect::<Vec<_>>()})
        },
    };Ok((200,body))
}
#[cfg(test)]mod tests{use super::*;
    #[test]fn api_authentication_read_only_routes_and_pagination(){
        let path=std::env::temp_dir().join(format!("pingan-api-{}.sqlite3",crate::store::id()));crate::store::execute(&path,"create_demo",json!({})).unwrap();
        let call=|method,url,auth|answer(&path,"secret",method,url,auth).unwrap();
        assert_eq!(call("GET","/v1/active",None).0,401);assert_eq!(call("POST","/v1/active",Some("Bearer secret")).0,405);
        assert_eq!(call("GET","/v1/active/summary",Some("Bearer secret")).1["souls"],240);
        let page=call("GET","/v1/active/souls?offset=239&limit=10000",Some("Bearer secret"));assert_eq!(page.0,200);assert_eq!(page.1["total"],240);assert_eq!(page.1["items"].as_array().unwrap().len(),1);assert_eq!(page.1["limit"],1000);
        assert_eq!(call("GET","/v1/active/delete",Some("Bearer secret")).0,404);assert_eq!(call("GET","/v1/active/summary/extra",Some("Bearer secret")).0,404);
        std::fs::remove_file(&path).ok();std::fs::remove_file(path.with_extension("sqlite3-wal")).ok();std::fs::remove_file(path.with_extension("sqlite3-shm")).ok();
    }
}
