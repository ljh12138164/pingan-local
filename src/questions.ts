import data from './data/questions.json';

export interface Question { id: number; question: string; answers: string[] }
export interface QuestionMatch { item: Question; approximate: boolean }
export const questions: Question[] = data.questions;
export const answerCount = new Set(questions.flatMap(q => q.answers)).size;
export const questionSource = data.source;
export const questionDate = data.fetchedAt.slice(0, 10);
export const excludedQuestions = data.excluded;
const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\p{S}]/gu, '');
const indexed = questions.map(item => ({ item, question: normalize(item.question), answer: item.answers.map(normalize).join('\0') }));

// Approximate substring distance: a short query can match part of a longer question.
function distance(query: string, text: string): number {
  let previous = new Array(text.length + 1).fill(0);
  for (let i = 1; i <= query.length; i++) {
    const next = [i];
    for (let j = 1; j <= text.length; j++) next[j] = Math.min(previous[j] + 1, next[j - 1] + 1, previous[j - 1] + Number(query[i - 1] !== text[j - 1]));
    previous = next;
  }
  return Math.min(...previous);
}
export function searchQuestions(query: string, field: 'question' | 'answer'): QuestionMatch[] {
  const words = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  if (!words.length) return indexed.map(({ item }) => ({ item, approximate: false }));
  const found: { item: Question; score: number }[] = [];
  for (const row of indexed) {
    let score = 0;
    const texts = row[field].split('\0');
    for (const word of words) {
      if (texts.some(text => text.includes(word))) continue;
      const limit = word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0;
      if (!limit) { score = -1; break; }
      const best = Math.min(...texts.map(text => distance(word, text)));
      if (best > limit) { score = -1; break; }
      score += best;
    }
    if (score >= 0) found.push({ item: row.item, score });
  }
  return found.sort((a, b) => a.score - b.score || a.item.id - b.item.id).map(({ item, score }) => ({ item, approximate: score > 0 }));
}
