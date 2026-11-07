import { useEffect, useState } from 'react';
import { useApp } from '../context';
import RuntimeRefresh from '../RuntimeRefresh';
import { realmCountdown, type RealmStatusData } from '../realmTime';
import { date, number, type Document } from '../types';

export default function RealmStatus({ data, compact = false }: { data?: Document | null; compact?: boolean }) {
  const { state } = useApp(); const status = (data === undefined ? state?.data : data)?.extras?.realmStatus as RealmStatusData | undefined; const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now() / 1000), 1000); return () => clearInterval(timer); }, []);
  const foster = status?.foster;
  const content = <><div className={compact ? 'realm-summary' : 'form-grid'}>
    <div className="realm-record"><h3>自有结界</h3>{status?.cards?.length ? status.cards.map(card => <div key={card.id}>
      <div className="realm-record-title"><span>{card.name ?? '未识别结界卡'}{card.hours !== null && ` · ${card.hours} 小时`}</span><strong role="timer" aria-label="结界卡剩余时间">{realmCountdown(card.endsAt, now)}</strong></div>
      {card.endsAt !== null && <small>结束于 {date(new Date(card.endsAt * 1000).toISOString())}</small>}
      {card.endsAt !== null && card.endsAt > now && card.rewards?.length ? <p className="realm-rewards">预计单卡产出：{card.rewards.map(r => `${r.name} ${r.total === null ? '未读取' : number(r.total)}`).join(' / ')}</p> : null}
    </div>) : <p className="muted">{status?.cards ? '当前未放置结界卡' : '结界缓存未读取，请打开游戏结界后刷新'}</p>}</div>
    <div className="realm-record"><h3>我的寄养</h3>{foster ? <>
      <div className="realm-record-title"><span>{foster.heroName ?? `式神 #${foster.heroId}`} · {foster.cardName ?? '卡片未识别'}</span><strong role="timer" aria-label="寄养剩余时间">{realmCountdown(foster.endsAt, now)}</strong></div>
      <small>{foster.friendName ?? `好友 #${foster.friendId}`}{foster.endsAt !== null && ` · ${date(new Date(foster.endsAt * 1000).toISOString())} 结束`}</small>
      {foster.endsAt !== null && foster.endsAt > now && <p className="realm-rewards">寄养记录奖励：{foster.rewards.map(r => `${r.name} ${number(r.amount)}`).join(' / ') || '未读取'}</p>}
    </> : <p className="muted">{status?.fosterLoaded ? '当前没有寄养记录' : '寄养缓存未读取，请打开游戏寄养页后刷新'}</p>}</div>
  </div>{!compact && !!status?.accruedRewards?.length && <p>结界已累计：{status.accruedRewards.map(r => `${r.name} ${number(r.amount)}`).join(' / ')}</p>}
  <p className="fineprint realm-capture">{status?.capturedAt ? `读取于 ${date(status.capturedAt)} · ` : ''}倒计时基于缓存；换卡、领取后需刷新确认。</p></>;
  return compact ? content : <section className="sheet padded"><div className="padded-heading"><h2>结界与寄养计时</h2></div><RuntimeRefresh />{content}</section>;
}
