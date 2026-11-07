import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { Hero } from './types';
import { matchesHero } from './heroSearch';

export default function HeroPicker({ heroes, value, onChange, label, emptyLabel = '选择式神', emptyValue = '', disabled = false, catalog = false }: {
  heroes: Hero[]; value: string; onChange: (value: string) => void; label: string; emptyLabel?: string; emptyValue?: string; disabled?: boolean; catalog?: boolean;
}) {
  const [open, setOpen] = useState(false); const [query, setQuery] = useState(''); const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 320, maxHeight: 350 });
  const trigger = useRef<HTMLButtonElement>(null); const input = useRef<HTMLInputElement>(null); const popup = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = heroes.find(h => h.id === value);
  const matches = useMemo(() => heroes.filter(h => matchesHero(h.name, query, h.id)).sort((a, b) => b.star - a.star || b.level - a.level || Number(b.awakened) - Number(a.awakened)), [heroes, query]);
  const meta = (h: Hero) => catalog ? `${h.rarity} · 图鉴编号 #${h.id}` : `${h.rarity} · ${h.star}星 · Lv.${h.level} · ${h.awakened ? '已觉醒' : '未觉醒'} · #${h.id.slice(-6)}`;
  const choices = [...(query.trim() ? [] : [{ id: emptyValue, name: emptyLabel, meta: emptyValue === 'manual' ? '直接编辑基础属性' : '清除当前选择' }]), ...matches.slice(0, 60).map(h => ({ id: h.id, name: h.name, meta: meta(h) }))];
  function close(restoreFocus = false) { setOpen(false); if (restoreFocus) trigger.current?.focus(); }
  function choose(id: string) { onChange(id); close(true); }
  useEffect(() => {
    if (!open) return;
    const rect = trigger.current!.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 18;
    const height = Math.min(380, Math.max(180, below >= 240 ? below : rect.top - 18));
    const width = Math.min(Math.max(rect.width, 340), window.innerWidth - 24);
    setPosition({ top: below >= 240 ? rect.bottom + 6 : Math.max(12, rect.top - height - 6), left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width, maxHeight: height });
    input.current?.focus();
    const outside = (event: PointerEvent) => { if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close(); };
    const dismiss = () => close();
    const scroll = (event: Event) => { if (!popup.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', outside); window.addEventListener('resize', dismiss); document.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', dismiss); document.removeEventListener('scroll', scroll, true); };
  }, [open]);
  useEffect(() => { if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, open, listId]);
  return <div className="hero-picker"><span className="field-label">{label}</span><button ref={trigger} type="button" className="hero-picker-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => { setQuery(''); setActive(0); setOpen(!open); }}><span>{selected ? <><b>{selected.name}</b><small>{catalog ? `${selected.rarity} · 图鉴编号 #${selected.id}` : `${selected.rarity} · ${selected.star}星 · Lv.${selected.level} · #${selected.id.slice(-6)}`}</small></> : emptyLabel}</span><ChevronDown size={16} /></button>
    {open && createPortal(<div ref={popup} className="hero-picker-popup" style={position} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
      if (event.key === 'Tab') close(true);
    }}><div className="picker-search"><Search size={17} /><input ref={input} role="combobox" aria-label="模糊搜索式神" aria-expanded="true" aria-autocomplete="list" aria-controls={listId} aria-activedescendant={choices.length ? `${listId}-${active}` : undefined} value={query} placeholder="名称 / 拼音 / 首字母 / 编号" onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={event => {
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && choices.length) { event.preventDefault(); setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length); }
      if (event.key === 'Enter') { event.preventDefault(); if (choices[active]) choose(choices[active].id); }
    }} />{query && <button type="button" className="icon-button" aria-label="清空式神搜索" onClick={() => { setQuery(''); setActive(0); input.current?.focus(); }}><X size={15} /></button>}</div><div className="picker-meta" role="status">匹配 {matches.length} 位{matches.length > 60 ? '，先显示 60 位，请继续输入缩小范围' : ''}</div><div role="listbox" id={listId} aria-label={label} className="picker-options">{choices.map((option, index) => <div key={option.id} id={`${listId}-${index}`} role="option" aria-selected={value === option.id} className={active === index ? 'highlighted' : ''} onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(option.id)}><span><b>{option.name}</b><small>{option.meta}</small></span>{value === option.id && <Check size={16} />}</div>)}{!matches.length && <p className="picker-no-results">没有匹配式神，试试更短的名字或拼音。</p>}</div><div className="picker-help">↑ ↓ 选择 · Enter 确认 · Esc 关闭</div></div>, document.body)}
  </div>;
}
