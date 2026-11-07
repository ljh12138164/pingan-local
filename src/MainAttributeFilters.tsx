import { labels } from './types';
import { mainOptions, mainSlots, type MainFilters } from './soulFilters';

export default function MainAttributeFilters({ value, onChange }: { value: MainFilters; onChange: (next: MainFilters) => void }) {
  return <div className="main-attribute-filters">
    {mainSlots.map(slot => <fieldset key={slot}>
      <legend>{slot}号位主属性 · 多选</legend>
      <button type="button" className="text" aria-pressed={!value[slot]?.length} onClick={() => onChange({ ...value, [slot]: [] })}>不限</button>
      {mainOptions[slot].map(key => <label className="check" key={key}>
        <input type="checkbox" checked={value[slot]?.includes(key) ?? false} onChange={event => {
          const selected = value[slot] ?? [];
          onChange({ ...value, [slot]: event.target.checked ? [...selected, key] : selected.filter(item => item !== key) });
        }} />{labels[key]}
      </label>)}
    </fieldset>)}
  </div>;
}
