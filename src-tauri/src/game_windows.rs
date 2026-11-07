use serde_json::{json,Value};
pub fn tile_plan(left:i32,top:i32,width:i32,height:i32,count:usize)->Result<Vec<(i32,i32,i32,i32)>,String>{
    if count==0||count>16{return Err("排列窗口数应为 1–16".into());}let columns=(count as f64).sqrt().ceil() as i32;let rows=(count as i32+columns-1)/columns;let(w,h)=(width/columns,height/rows);if w<320||h<240{return Err("当前工作区不足以排列这些窗口，请减少窗口数".into());}
    Ok((0..count).map(|i|(left+(i as i32%columns)*w,top+(i as i32/columns)*h,w,h)).collect())
}
#[cfg(windows)]mod native{
    use super::*;
    use windows_sys::Win32::{Foundation::{HWND,LPARAM,RECT},UI::WindowsAndMessaging::*};
    struct Window{handle:HWND,pid:u32,title:String,rect:RECT}
    unsafe extern "system" fn collect(handle:HWND,data:LPARAM)->i32{
        if IsWindowVisible(handle)==0{return 1;}let mut pid=0;GetWindowThreadProcessId(handle,&mut pid);let rows=&mut*(data as *mut Vec<Window>);let mut title=[0u16;512];let length=GetWindowTextW(handle,title.as_mut_ptr(),512);if length<=0{return 1;}let mut rect=RECT::default();if GetWindowRect(handle,&mut rect)==0{return 1;}rows.push(Window{handle,pid,title:String::from_utf16_lossy(&title[..length as usize]),rect});1
    }
    fn windows()->Result<Vec<Window>,String>{let pids=crate::bridge::processes()?;let pids:std::collections::HashSet<_>=pids.as_array().into_iter().flatten().filter_map(|p|p["pid"].as_u64()).map(|p|p as u32).collect();let mut rows:Vec<Window>=Vec::new();unsafe{if EnumWindows(Some(collect),&mut rows as *mut Vec<Window> as LPARAM)==0{return Err(std::io::Error::last_os_error().to_string());}}rows.retain(|w|pids.contains(&w.pid));Ok(rows)}
    pub fn list()->Result<Value,String>{Ok(json!(windows()?.iter().map(|w|json!({"pid":w.pid,"title":w.title,"x":w.rect.left,"y":w.rect.top,"width":w.rect.right-w.rect.left,"height":w.rect.bottom-w.rect.top})).collect::<Vec<_>>()))}
    pub fn arrange(input:&Value)->Result<Value,String>{
        let mut windows=windows()?;windows.sort_by_key(|w|w.pid);if windows.is_empty(){return Err("未找到可排列的游戏窗口".into());}
        let positions=if input["mode"]=="tile"{let mut rect=RECT::default();unsafe{if SystemParametersInfoW(SPI_GETWORKAREA,0,&mut rect as *mut RECT as *mut _,0)==0{return Err(std::io::Error::last_os_error().to_string());}}tile_plan(rect.left,rect.top,rect.right-rect.left,rect.bottom-rect.top,windows.len())?}else{
            let pid=input["pid"].as_u64().ok_or("缺少游戏进程 ID")?;windows.retain(|w|u64::from(w.pid)==pid);if windows.is_empty(){return Err("游戏窗口已关闭或进程不匹配".into());}
            let get=|k:&str|input[k].as_i64().and_then(|v|i32::try_from(v).ok()).ok_or_else(||format!("窗口参数 {k} 无效"));let(x,y,w,h)=(get("x")?,get("y")?,get("width")?,get("height")?);if !(-32768..=32767).contains(&x)||!(-32768..=32767).contains(&y)||!(320..=7680).contains(&w)||!(240..=4320).contains(&h){return Err("窗口位置或尺寸超出允许范围".into());}vec![(x,y,w,h);windows.len()]
        };
        for(window,(x,y,w,h))in windows.iter().zip(positions){unsafe{if SetWindowPos(window.handle,std::ptr::null_mut(),x,y,w,h,SWP_NOZORDER|SWP_NOACTIVATE)==0{return Err(format!("调整进程 {} 的窗口失败：{}",window.pid,std::io::Error::last_os_error()));}}}list()
    }
}
#[cfg(windows)]pub use native::{list,arrange};
#[cfg(not(windows))]pub fn list()->Result<Value,String>{Ok(json!([]))}
#[cfg(not(windows))]pub fn arrange(_: &Value)->Result<Value,String>{Err("窗口管理仅支持 Windows".into())}
#[cfg(test)]mod tests{use super::*;#[test]fn tiles_use_work_area_offsets_and_never_overlap(){let tiles=tile_plan(-1920,40,1920,1040,4).unwrap();assert_eq!(tiles[0],(-1920,40,960,520));assert_eq!(tiles[3],(-960,560,960,520));assert!(tile_plan(0,0,640,480,16).is_err());}}
