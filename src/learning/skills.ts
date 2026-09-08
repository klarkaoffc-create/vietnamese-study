/**
 * Skill-oriented progress reporting.
 *
 * The old report counted "flashcards mastered". That number said nothing
 * about being able to speak, so it is gone. These metrics answer the
 * questions that actually matter for fluency: can I retrieve words myself,
 * can I build sentences, can I hold up my end of a conversation.
 */
import { allVocab, scenarios } from '../data/content';
import { allGrammar } from '../data/content';
import { isAutomatic, makeSrsId, mastery, type SrsItem } from './srs';
import type { AppState } from './state';

export type SkillId = 'vocab-active' | 'vocab-passive' | 'sentences' | 'dialogue' | 'grammar' | 'listening' | 'automaticity';

export interface SkillScore {
  id: SkillId;
  label: string;
  /** 0–100. */
  percent: number;
  /** Human explanation of what the number counts. */
  detail: string;
  /** How many units this covers, for context. */
  practised: number;
  total: number;
}

const avg = (nums: number[]) => (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0);

function itemsOf(state: AppState, kind: string): SrsItem[] {
  return Object.values(state.srs).filter((i) => i.kind === kind);
}

/**
 * Mastery across a whole population: unpractised units count as 0 so the
 * number reflects the share of the course you can actually use, not just how
 * well the handful of items you have touched are going.
 */
export function populationScore(items: SrsItem[], population: number): number {
  if (population === 0) return 0;
  const sum = items.reduce((a, i) => a + mastery(i), 0);
  return Math.round(sum / population);
}

export function skillScores(state: AppState): SkillScore[] {
  const activeVocab = itemsOf(state, 'vocab-active');
  const passiveVocab = itemsOf(state, 'vocab-passive');
  const grammarItems = itemsOf(state, 'grammar');
  const dialogueItems = itemsOf(state, 'dialogue');
  const sentenceItems = itemsOf(state, 'sentence');
  const listeningItems = itemsOf(state, 'listening');

  const vocabPopulation = allVocab.filter((v) => v.srs && v.status !== 'flagged').length;
  const grammarPopulation = allGrammar.length;
  const scenarioPopulation = scenarios.length;

  const all = [...activeVocab, ...grammarItems, ...dialogueItems, ...sentenceItems];
  const automatic = all.filter(isAutomatic).length;

  return [
    {
      id: 'vocab-active',
      label: 'Słownictwo aktywne',
      percent: populationScore(activeVocab, vocabPopulation),
      detail: 'Słowa, które potrafisz sam(a) wydobyć i użyć w zdaniu.',
      practised: activeVocab.length,
      total: vocabPopulation,
    },
    {
      id: 'vocab-passive',
      label: 'Rozumienie słownictwa',
      percent: populationScore(passiveVocab, vocabPopulation),
      detail: 'Słowa, które rozpoznajesz, gdy je widzisz lub słyszysz.',
      practised: passiveVocab.length,
      total: vocabPopulation,
    },
    {
      id: 'sentences',
      label: 'Budowanie zdań',
      percent: populationScore(sentenceItems, Math.max(scenarioPopulation, sentenceItems.length)),
      detail: 'Całe zdania i sytuacje komunikacyjne wykonane po wietnamsku.',
      practised: sentenceItems.length,
      total: Math.max(scenarioPopulation, sentenceItems.length),
    },
    {
      id: 'dialogue',
      label: 'Odpowiedzi w dialogach',
      percent: avg(dialogueItems.map(mastery)),
      detail: 'Reakcje na repliki rozmówcy.',
      practised: dialogueItems.length,
      total: dialogueItems.length,
    },
    {
      id: 'grammar',
      label: 'Gramatyka w użyciu',
      percent: populationScore(grammarItems, grammarPopulation),
      detail: 'Struktury użyte w żywych zdaniach, nie w regułkach.',
      practised: grammarItems.length,
      total: grammarPopulation,
    },
    {
      id: 'listening',
      label: 'Rozumienie ze słuchu',
      percent: avg(listeningItems.map(mastery)),
      detail: listeningItems.length ? 'Zadania ze słuchu na prawdziwych nagraniach.' : 'Dostępne, gdy dodasz nagrania do content/audio.',
      practised: listeningItems.length,
      total: listeningItems.length,
    },
    {
      id: 'automaticity',
      label: 'Automatyzm',
      percent: all.length ? Math.round((automatic / all.length) * 100) : 0,
      detail: 'Udział umiejętności produkowanych bez podpowiedzi i z długim odstępem.',
      practised: automatic,
      total: all.length,
    },
  ];
}

/** Words the learner understands but still cannot produce — the gap to close. */
export function passiveOnlyVocab(state: AppState): string[] {
  const out: string[] = [];
  for (const v of allVocab) {
    const passive = state.srs[makeSrsId('vocab-passive', v.id)];
    const active = state.srs[makeSrsId('vocab-active', v.id)];
    if (passive && mastery(passive) >= 40 && (!active || mastery(active) < 25)) out.push(v.id);
  }
  return out;
}
