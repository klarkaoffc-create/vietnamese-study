/**
 * Helpers for sentences that are taught in meaningful pieces.
 *
 * The pieces themselves are authored in content (see `ChunkSchema`), because
 * where a Vietnamese sentence divides is a question of grammar and meaning,
 * not of word count. Nothing here invents a division.
 */
import type { Chunk } from '../data/schema';
import { comparisonForm } from './vietnamese';

/** True when the chunks, read in order, say exactly the sentence. */
export function chunksRebuild(sentence: string, chunks: Chunk[]): boolean {
  return comparisonForm(chunks.map((c) => c.vi).join(' ')) === comparisonForm(sentence);
}

/**
 * The Polish glosses in VIETNAMESE order: a scaffold that shows how the
 * sentence is built without giving away a single Vietnamese word.
 */
export function chunkScaffold(chunks: Chunk[]): string {
  return chunks.map((c) => c.pl).join('  ·  ');
}
