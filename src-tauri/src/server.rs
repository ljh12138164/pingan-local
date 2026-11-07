use serde_json::{json,Value};
use tiny_http::{Header,Method,Response,Server,StatusCode};
fn main(){
    let server=std::sync::Arc::new(Server::http("127.0.0.1:47821").expect("开发 API 端口 47821 被占用"));
    let path=std::env::var_os("PINGAN_DB_PATH").map(std::path::PathBuf::from).unwrap_or_else(pingan_core::store::database_path);
    println!("本地 Rust API: http://127.0.0.1:47821 — {}",path.display());
    let workers:Vec<_>=(0..4).map(|_|{let server=server.clone();let path=path.clone();std::thread::spawn(move||{for request in server.incoming_requests(){handle(request,&path);}})}).collect();
    for worker in workers{let _=worker.join();}
}
fn handle(mut request:tiny_http::Request,path:&std::path::Path){
        let started=std::time::Instant::now();
        let valid=request.headers().iter().all(|h|if h.field.equiv("Origin"){h.value.as_str()=="http://127.0.0.1:47820"}else if h.field.equiv("Host"){["127.0.0.1:47820","127.0.0.1:47821"].contains(&h.value.as_str())}else{true});
        let (status,value)=if !valid{(403,json!({"error":"不允许的请求来源"}))}else if request.method()==&Method::Get&&request.url()=="/api/health"{(200,json!({"ok":true}))}else if request.method()==&Method::Post&&request.url()=="/api/execute"{
            if request.body_length().is_some_and(|n|n>70*1024*1024){(413,json!({"error":"请求过大"}))}else{
                let mut body=String::new();
                match request.as_reader().take(70*1024*1024+1).read_to_string(&mut body){
                    Ok(_) if body.len()<=70*1024*1024=>match serde_json::from_str::<Value>(&body){Ok(v)=>{let operation=v["operation"].as_str().unwrap_or("");eprintln!("API begin {operation}");let result=pingan_core::store::execute(&path,operation,v["input"].clone());eprintln!("API end {operation}: {} ms",started.elapsed().as_millis());match result{Ok(result)=>(200,json!({"result":result})),Err(e)=>(400,json!({"error":e}))}},Err(e)=>(400,json!({"error":e.to_string()}))},
                    _=>(400,json!({"error":"请求读取失败或过大"}))
                }
            }
        }else{(404,json!({"error":"接口不存在"}))};
        let response=Response::from_string(value.to_string()).with_status_code(StatusCode(status)).with_header(Header::from_bytes("Content-Type","application/json; charset=utf-8").unwrap()).with_header(Header::from_bytes("X-Content-Type-Options","nosniff").unwrap());
        let _=request.respond(response);
}
use std::io::Read;
