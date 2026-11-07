//! ADB discovery and an independent, read-only Android process transport.
use serde_json::{json,Value};
use std::{path::{Path,PathBuf},process::{Command,Stdio},io::{Read,Write},time::{Duration,Instant},collections::HashMap,net::{TcpStream,Shutdown}};
type Result<T>=std::result::Result<T,String>;
fn command(adb:&Path)->Command{let mut c=Command::new(adb);#[cfg(windows)]{use std::os::windows::process::CommandExt;c.creation_flags(0x08000000);}c}
fn run(adb:&Path,args:&[&str])->Result<String>{
    let mut child=command(adb).args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e|format!("ADB 启动失败：{e}"))?;
    let mut stdout=child.stdout.take().unwrap();let mut stderr=child.stderr.take().unwrap();
    let out=std::thread::spawn(move||{let mut b=Vec::new();stdout.by_ref().take(8*1024*1024).read_to_end(&mut b).ok();b});
    let err=std::thread::spawn(move||{let mut b=Vec::new();stderr.by_ref().take(65536).read_to_end(&mut b).ok();b});
    let start=Instant::now();let status=loop{if let Some(status)=child.try_wait().map_err(|e|e.to_string())?{break status;}if start.elapsed()>Duration::from_secs(15){child.kill().ok();child.wait().ok();return Err("ADB 操作超时，请确认模拟器已启动".into());}std::thread::sleep(Duration::from_millis(20));};
    let output=String::from_utf8_lossy(&out.join().map_err(|_|"ADB 输出读取失败")?).trim().to_string();let error=String::from_utf8_lossy(&err.join().map_err(|_|"ADB 输出读取失败")?).trim().to_string();
    if !status.success(){return Err(format!("ADB 操作失败：{error} {output}"));}Ok(output)
}
pub fn adb_path(root:&str)->Result<PathBuf>{let root=PathBuf::from(root);if !root.is_absolute(){return Err("请填写模拟器安装目录或 adb.exe 的绝对路径".into());}for p in [root.clone(),root.join("nx_main/adb.exe"),root.join("shell/adb.exe"),root.join("adb.exe")]{if p.is_file()&&p.file_name().is_some_and(|n|n.eq_ignore_ascii_case("adb.exe")){return Ok(p);}}Err("该目录中没有找到 adb.exe".into())}
fn serial_valid(s:&str)->bool{!s.is_empty()&&s.len()<128&&s.bytes().all(|b|b.is_ascii_alphanumeric()||b"._:-".contains(&b))}
fn shell(adb:&Path,serial:&str,args:&[&str])->Result<String>{if !serial_valid(serial){return Err("模拟器设备编号无效".into());}let mut all=vec!["-s",serial,"shell"];all.extend(args);run(adb,&all)}
fn device_rows(output:&str)->Vec<Value>{output.lines().filter_map(|line|{let mut fields=line.split_whitespace();let serial=fields.next()?;let status=fields.next()?;if !serial_valid(serial)||!["device","offline","unauthorized","recovery","sideload","bootloader"].contains(&status){return None;}Some(json!({"serial":serial,"status":status,"description":fields.collect::<Vec<_>>().join(" ")}))}).collect()}
fn loopback_serial(serial:&str)->bool{serial.parse::<std::net::SocketAddr>().is_ok_and(|address|address.ip().is_loopback()&&address.port()>0)}
fn mumu_running_serials(info:&Value)->Vec<String>{
    let mut serials:Vec<_>=info.as_object().into_iter().flat_map(|rows|rows.values()).filter(|row|row["is_android_started"]==true).filter_map(|row|{
        let host=row["adb_host_ip"].as_str()?;let port=u16::try_from(row["adb_port"].as_u64()?).ok()?;
        let serial=format!("{host}:{port}");loopback_serial(&serial).then_some(serial)
    }).collect();serials.sort();serials.dedup();serials
}
pub fn devices(root:&str)->Result<Value>{
    let adb=adb_path(root)?;let mut rows=device_rows(&run(&adb,&["devices","-l"])?);let manager=adb.with_file_name("MuMuManager.exe");
    if manager.is_file(){
        let discovered=run(&manager,&["info","--vmindex","all"]).and_then(|output|serde_json::from_str::<Value>(&output).map_err(|_|"MuMu 实例信息格式无法识别".to_string()));
        match discovered{
            Ok(info)=>{for serial in mumu_running_serials(&info){if !rows.iter().any(|row|row["serial"]==serial&&row["status"]=="device"){run(&adb,&["connect",&serial])?;}}rows=device_rows(&run(&adb,&["devices","-l"])?);},
            Err(error) if rows.is_empty()=>return Err(format!("MuMu 实例发现失败：{error}")),
            Err(_)=>{},
        }
    }
    Ok(json!({"adb":adb,"devices":rows}))
}
fn ensure_connection(adb:&Path,serial:&str)->Result<()>{
    if !serial_valid(serial){return Err("模拟器设备编号无效".into());}
    let rows=device_rows(&run(adb,&["devices","-l"])?);
    if !rows.iter().any(|row|row["serial"]==serial&&row["status"]=="device")&&loopback_serial(serial){run(adb,&["connect",serial])?;}
    Ok(())
}
pub fn probe(root:&str,serial:&str,enable_root:bool)->Result<Value>{
    let adb=adb_path(root)?;if !serial_valid(serial){return Err("模拟器设备编号无效".into());}
    ensure_connection(&adb,serial)?;
    if enable_root{run(&adb,&["-s",serial,"root"])?;run(&adb,&["-s",serial,"wait-for-device"])?;}
    let identity=shell(&adb,serial,&["id"])?;let root=identity.contains("uid=0(");let abi=shell(&adb,serial,&["getprop","ro.product.cpu.abilist"])?;
    let packages=shell(&adb,serial,&["pm","list","packages","onmyoji"])?;let mut games=vec![];
    for package in packages.lines().filter_map(|s|s.strip_prefix("package:")){if !package.starts_with("com.netease.onmyoji")||!package.bytes().all(|b|b.is_ascii_alphanumeric()||b"._".contains(&b)){continue;}let pids=shell(&adb,serial,&["pidof",package]).unwrap_or_default();for pid in pids.split_whitespace().filter_map(|s|s.parse::<u32>().ok()){games.push(json!({"package":package,"pid":pid}));}}
    Ok(json!({"serial":serial,"root":root,"abi":abi,"games":games,"ready":root&&!games.is_empty(),"capturedAt":chrono::Utc::now().to_rfc3339()}))
}
fn select_runtime_pid(mut running:Vec<u32>,previous:u32)->Result<u32>{
    running.sort_unstable();running.dedup();
    if running.contains(&previous){return Ok(previous);}
    match running.as_slice(){[pid]=>Ok(*pid),[]=>Err("模拟器中没有运行的阴阳师，请先登录游戏".into()),_=>Err("模拟器中有多个阴阳师进程，请到数据读取页选择游戏后重新读取".into())}
}
pub fn runtime_pid(root:&str,serial:&str,previous:u32)->Result<u32>{
    let found=probe(root,serial,false)?;
    if found["root"]!=true{return Err("模拟器的只读连接未取得 root 权限，请到数据读取页检查权限与游戏".into());}
    let running=found["games"].as_array().into_iter().flatten().filter_map(|g|g["pid"].as_u64().and_then(|pid|u32::try_from(pid).ok())).collect();
    select_runtime_pid(running,previous)
}
pub fn maps(adb:&Path,serial:&str,pid:u32)->Result<String>{shell(adb,serial,&["cat",&format!("/proc/{pid}/maps")])}
pub fn client_base(maps:&str)->Result<usize>{for line in maps.lines(){let fields:Vec<_>=line.split_whitespace().collect();if fields.len()>=6&&fields[2]=="00000000"&&fields.last().is_some_and(|p|p.ends_with("/libclient.so")){return usize::from_str_radix(fields[0].split('-').next().unwrap_or(""),16).map_err(|_|"游戏模块地址无效".into());}}Err("未找到游戏 libclient.so，请先登录游戏".into())}

pub struct Memory{socket:TcpStream,pages:HashMap<usize,Vec<u8>>}
impl Drop for Memory{fn drop(&mut self){self.socket.shutdown(Shutdown::Both).ok();}}
fn service(socket:&mut TcpStream,name:&str)->Result<()>{socket.write_all(format!("{:04x}{name}",name.len()).as_bytes()).map_err(|e|e.to_string())?;let mut status=[0;4];socket.read_exact(&mut status).map_err(|e|e.to_string())?;if &status==b"OKAY"{return Ok(());}if &status==b"FAIL"{let mut n=[0;4];socket.read_exact(&mut n).map_err(|e|e.to_string())?;let n=usize::from_str_radix(std::str::from_utf8(&n).map_err(|_|"ADB 响应无效")?,16).map_err(|_|"ADB 响应长度无效")?;let mut error=vec![0;n];socket.read_exact(&mut error).map_err(|e|e.to_string())?;return Err(format!("ADB 服务拒绝读取：{}",String::from_utf8_lossy(&error)));}Err("ADB 服务响应无效".into())}
impl Memory{
    pub fn open(adb:&Path,serial:&str,pid:u32)->Result<Self>{
        let abi=shell(adb,serial,&["getprop","ro.product.cpu.abi"])?;if abi!="x86_64"{return Err(format!("当前独立读取器尚未验证模拟器架构 {abi}"));}
        let bytes=include_bytes!("../reader/memory-x86_64");let local=std::env::temp_dir().join("pingan-memory-x86_64");std::fs::write(&local,bytes).map_err(|e|e.to_string())?;
        run(adb,&["-s",serial,"push",local.to_str().ok_or("读取组件路径无效")?,"/data/local/tmp/pingan-memory-x86_64"])?;
        shell(adb,serial,&["chmod","700","/data/local/tmp/pingan-memory-x86_64"])?;
        if !serial_valid(serial){return Err("模拟器设备编号无效".into());}
        let mut socket=TcpStream::connect_timeout(&"127.0.0.1:5037".parse().unwrap(),Duration::from_secs(3)).map_err(|e|e.to_string())?;socket.set_read_timeout(Some(Duration::from_secs(5))).map_err(|e|e.to_string())?;socket.set_write_timeout(Some(Duration::from_secs(5))).map_err(|e|e.to_string())?;socket.set_nodelay(true).ok();
        service(&mut socket,&format!("host:transport:{serial}"))?;service(&mut socket,&format!("exec:/data/local/tmp/pingan-memory-x86_64 {pid}"))?;
        Ok(Self{socket,pages:HashMap::new()})
    }
    pub fn clear(&mut self){self.pages.clear();}
    fn request(&mut self,address:usize,n:usize)->Result<Vec<u8>>{let mut request=[0;12];request[..8].copy_from_slice(&(address as u64).to_le_bytes());request[8..].copy_from_slice(&(n as u32).to_le_bytes());self.socket.write_all(&request).map_err(|_|"模拟器读取通道已断开")?;let mut h=[0;4];self.socket.read_exact(&mut h).map_err(|_|"模拟器读取组件退出或超时，请确认 root 权限")?;let len=u32::from_le_bytes(h) as usize;if len>n{return Err("模拟器内存不可读，请保持庭院后重试".into());}let mut b=vec![0;len];self.socket.read_exact(&mut b).map_err(|_|"模拟器读取中断")?;Ok(b)}
    pub fn fresh(&mut self,address:usize,n:usize)->Result<Vec<u8>>{if n==0{return Ok(vec![]);}self.pages.retain(|page,_|*page+4096<=address||*page>=address+n);let b=self.request(address,n)?;if b.len()!=n{return Err("模拟器内存范围不完整".into());}Ok(b)}
    pub fn read(&mut self,address:usize,n:usize)->Result<Vec<u8>>{if n==0{return Ok(vec![]);}if n>4096{return self.fresh(address,n);}let mut out=Vec::with_capacity(n);while out.len()<n{let at=address+out.len();let page=at&!4095;if !self.pages.contains_key(&page){let bytes=self.request(page,4096)?;self.pages.insert(page,bytes);}let bytes=&self.pages[&page];let offset=at-page;let end=(offset+n-out.len()).min(bytes.len());if offset>=end{return Err("模拟器内存页不完整".into());}out.extend_from_slice(&bytes[offset..end]);}Ok(out)}
}

#[cfg(test)]mod tests{use super::*;#[test]fn parses_only_mapped_client_base(){assert_eq!(client_base("72991b202000-729922291000 r-xp 00000000 08:23 1 /data/app/a/lib/x86_64/libclient.so").unwrap(),0x72991b202000);assert!(client_base("123-456 rw-p 00001000 00:00 0 /libclient.so").is_err());assert!(!serial_valid("x;reboot"));assert!(serial_valid("127.0.0.1:16384"));}
#[test]fn runtime_reconnect_handles_restart_without_guessing_between_games(){assert_eq!(select_runtime_pid(vec![2192],99999).unwrap(),2192);assert_eq!(select_runtime_pid(vec![2192,2192],99999).unwrap(),2192);assert_eq!(select_runtime_pid(vec![2192,3000],2192).unwrap(),2192);assert!(select_runtime_pid(vec![],2192).is_err());assert!(select_runtime_pid(vec![2192,3000],99999).is_err());}
#[test]fn discovers_started_local_instances_without_connecting_to_remote_or_invalid_ports(){
    let info=json!({"0":{"is_android_started":true,"adb_host_ip":"127.0.0.1","adb_port":16384},"duplicate":{"is_android_started":true,"adb_host_ip":"127.0.0.1","adb_port":16384},"stopped":{"is_android_started":false,"adb_host_ip":"127.0.0.1","adb_port":16416},"remote":{"is_android_started":true,"adb_host_ip":"192.168.1.9","adb_port":5555},"zero":{"is_android_started":true,"adb_host_ip":"127.0.0.1","adb_port":0},"overflow":{"is_android_started":true,"adb_host_ip":"127.0.0.1","adb_port":65536},"missing":{"is_android_started":true},"unknown":{"adb_host_ip":"127.0.0.1","adb_port":16448}});
    assert_eq!(mumu_running_serials(&info),vec!["127.0.0.1:16384"]);assert!(mumu_running_serials(&Value::Null).is_empty());
}
#[test]fn adb_listing_keeps_connection_states_without_parsing_daemon_messages_as_devices(){
    let rows=device_rows("* daemon started successfully\nList of devices attached\n127.0.0.1:16384 device product:MuMu model:MuMu\n127.0.0.1:16416 offline\nusb-123 unauthorized\n");
    assert_eq!(rows.len(),3);assert_eq!(rows[0]["serial"],"127.0.0.1:16384");assert_eq!(rows[1]["status"],"offline");assert_eq!(rows[2]["status"],"unauthorized");
}}
