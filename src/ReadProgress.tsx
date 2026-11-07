import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
export default function ReadProgress() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const started = Date.now(); const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000); return () => clearInterval(timer); }, []);
  return <div className="read-progress" role="status"><LoaderCircle className="spin" size={19} /><div><strong>正在采集游戏快照 · 已用 {seconds} 秒</strong><p>库存较多时需要数十秒，请保持游戏运行。完成后会显示数量与读取报告。</p></div></div>;
}
