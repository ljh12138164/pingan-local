import { useEffect, useRef } from 'react';
import { useApp } from './context';
import { realmDueEvents, type RealmStatusData } from './realmTime';

// In-app only: no OS permission prompts and no interaction with the game.
export default function RealmReminders() {
  const { state, notify, history } = useApp();
  const status = state?.data?.extras?.realmStatus as RealmStatusData | undefined;
  const enabled = state?.settings.realmReminders === true;
  const seen = useRef(new Set<string>());
  const armed = useRef({ profile: '', at: Date.now() / 1000, enabled: false });
  useEffect(() => {
    const profile = state?.activeId ?? '';
    const active = enabled && !history;
    if (armed.current.profile !== profile || armed.current.enabled !== active) armed.current = { profile, at: Date.now() / 1000, enabled: active };
    if (!active || !profile) return;
    const timer = setInterval(() => {
      const due = realmDueEvents(status, armed.current.at, Date.now() / 1000).filter(event => !seen.current.has(`${profile}:${event.key}`));
      if (!due.length) return;
      for (const event of due) seen.current.add(`${profile}:${event.key}`);
      notify(due.map(event => event.text).join('；'),false,'reminder');
    }, 1000);
    return () => clearInterval(timer);
  }, [enabled, state?.activeId, status, notify, history]);
  return null;
}
