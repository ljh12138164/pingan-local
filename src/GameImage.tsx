import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import mediaIndex from './gameMediaIndex.json';
import suitImages from './data/suit-images.json';
const available = new Set(mediaIndex);

export default function GameImage({ id, kind = 'hero', name, className = '' }: { id: string; kind?: 'hero' | 'suit' | 'currency' | 'headskin' | 'spirit'; name: string; className?: string }) {
  const [failed, setFailed] = useState('');
  const imageId = id || (kind === 'suit' ? (suitImages.suits as Record<string, string>)[name] ?? '' : '');
  const source = `/game-media/${kind}/${encodeURIComponent(imageId)}.png`;
  return failed === source || !available.has(`${kind}/${imageId}`) ? <span className={`game-image unavailable ${className}`} role="img" aria-label={`${name}图片未收录`}><ImageOff size={20} /></span> : <img className={`game-image ${className}`} src={source} alt={name} loading="lazy" decoding="async" onError={() => setFailed(source)} />;
}
