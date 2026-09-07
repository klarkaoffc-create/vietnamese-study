import { describe, expect, it } from 'vitest';
import { comparisonForm, detectTone, editDistance, feedbackFor, matchAny, matchPatterns, matchVietnamese, normalizeVietnamese, stripDiacritics } from '../src/utilities/vietnamese';

describe('normalizeVietnamese', () => {
  it('normalises to NFC and collapses whitespace', () => {
    const nfd = 'Xin chào'.normalize('NFD');
    expect(normalizeVietnamese(`  ${nfd}   ban  `)).toBe('Xin chào ban');
    expect(normalizeVietnamese('Xin chào').normalize('NFC')).toBe('Xin chào');
  });
  it('keeps tones intact', () => {
    expect(normalizeVietnamese('Cảm ơn')).toBe('Cảm ơn');
  });
});

describe('comparisonForm', () => {
  it('ignores case and punctuation', () => {
    expect(comparisonForm('Bạn tên là gì?')).toBe('bạn tên là gì');
    expect(comparisonForm('  Chào   chị!  ')).toBe('chào chị');
  });
  it('treats NFD and NFC input alike', () => {
    expect(comparisonForm('chào'.normalize('NFD'))).toBe(comparisonForm('chào'));
  });
});

describe('stripDiacritics', () => {
  it('removes tones, vowel marks and đ', () => {
    expect(stripDiacritics('Tiếng Việt')).toBe('Tieng Viet');
    expect(stripDiacritics('đường phố')).toBe('duong pho');
    expect(stripDiacritics('Cảm ơn')).toBe('Cam on');
  });
});

describe('detectTone', () => {
  it('detects the six tones', () => {
    expect(detectTone('ma')).toBe('ngang');
    expect(detectTone('mà')).toBe('huyền');
    expect(detectTone('má')).toBe('sắc');
    expect(detectTone('mả')).toBe('hỏi');
    expect(detectTone('mã')).toBe('ngã');
    expect(detectTone('mạ')).toBe('nặng');
  });
  it('ignores vowel quality marks', () => {
    expect(detectTone('ơn')).toBe('ngang');
    expect(detectTone('việt')).toBe('nặng');
  });
});

describe('matchVietnamese', () => {
  it('accepts exact answers regardless of case/punctuation', () => {
    expect(matchVietnamese('bạn tên là gì', 'Bạn tên là gì?')).toEqual({ kind: 'correct' });
  });
  it('flags missing tones as "tone" and names the words', () => {
    const r = matchVietnamese('Cam on', 'Cảm ơn');
    expect(r.kind).toBe('tone');
    if (r.kind === 'tone') expect(r.words).toEqual(['cảm', 'ơn']);
  });
  it('flags a wrong tone mark as "tone", not correct', () => {
    const r = matchVietnamese('chị', 'chỉ');
    expect(r.kind).toBe('tone');
  });
  it('does not silently equate old-style and new-style tone placement', () => {
    // "khoẻ" (tone on the second vowel, pre-1980 convention) and "khỏe"
    // (tone on the first vowel, current convention) are two different,
    // genuinely distinct spellings of the same word — not the same
    // codepoints under NFC/NFD. The grader intentionally does not treat
    // them as equivalent; this is a documented limitation (see README).
    expect(matchVietnamese('Bạn khoẻ không', 'Bạn khỏe không').kind).not.toBe('correct');
  });
  it('never marks tone-stripped text as fully correct', () => {
    expect(matchVietnamese('Toi 20 tuoi', 'Tôi 20 tuổi.').kind).toBe('tone');
  });
  it('reports other differences as wrong', () => {
    expect(matchVietnamese('Cảm ơn', 'Xin lỗi').kind).toBe('wrong');
    expect(matchVietnamese('', 'Xin lỗi').kind).toBe('wrong');
  });
});

describe('matchAny', () => {
  it('prefers a correct match over a tone match', () => {
    const r = matchAny('hai mươi mốt', ['hai mươi một', 'hai mươi mốt']);
    expect(r.kind).toBe('correct');
    expect(r.expected).toBe('hai mươi mốt');
  });
  it('returns tone when only base letters match', () => {
    expect(matchAny('hai muoi mot', ['hai mươi một']).kind).toBe('tone');
  });
});

describe('feedbackFor', () => {
  it('produces the Polish "almost" feedback with the word', () => {
    const r = matchVietnamese('Xin chao', 'Xin chào');
    expect(feedbackFor(r, 'Xin chào')).toBe('Prawie dobrze — sprawdź znak/ton w słowie „chào”.');
  });
});

describe('matchPatterns', () => {
  it('matches {x} placeholders', () => {
    expect(matchPatterns('Mình tên là Klara.', ['Mình tên là {x}']).kind).toBe('correct');
    expect(matchPatterns('Tôi tên là Klara', ['Mình tên là {x}', 'Tôi tên là {x}']).kind).toBe('correct');
  });
  it('detects missing tones in the fixed part', () => {
    const r = matchPatterns('Minh ten la Klara', ['Mình tên là {x}']);
    expect(r.kind).toBe('tone');
  });
  it('rejects unrelated sentences', () => {
    expect(matchPatterns('Xin chào', ['Mình tên là {x}']).kind).toBe('wrong');
  });
});

describe('editDistance', () => {
  it('counts an adjacent-letter transposition as a single edit', () => {
    // "nhge" for "nghe" is the actual confirmed typo from Bài 5 (see
    // CONTENT_REVIEW.md). A transposition must cost 1, not 2, so it is
    // classified as a spelling slip rather than a vocabulary miss.
    expect(editDistance('nghe', 'nhge')).toBe(1);
    expect(editDistance('Chào', 'chào')).toBe(0);
  });
  it('still counts unrelated substitutions normally', () => {
    expect(editDistance('mèo', 'chó')).toBeGreaterThan(1);
  });
});
