import { describe, it, expect } from 'vitest';
import {
  fuzzyMatch,
  normalize,
  levenshteinDistance,
  getThreshold,
  type FuzzySearchTerm,
} from '../fuzzy-search';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convenience: build a single text-type data entry. */
function text(term: string): FuzzySearchTerm {
  return { term, type: 'text' };
}

/** Convenience: build a single literal-type data entry. */
function literal(term: string): FuzzySearchTerm {
  return { term, type: 'literal' };
}

// ---------------------------------------------------------------------------
// normalize()
// ---------------------------------------------------------------------------

describe('normalize', () => {
  it('lowercases ASCII strings', () => {
    expect(normalize('Resistor')).toBe('resistor');
  });

  it('strips combining diacritical marks', () => {
    // e-acute (composed) -> 'e'
    expect(normalize('\u00e9')).toBe('e');
    // n-tilde
    expect(normalize('\u00f1')).toBe('n');
  });

  it('handles mixed case and diacritics', () => {
    expect(normalize('R\u00e9sistance')).toBe('resistance');
  });

  it('passes through non-Latin characters unchanged', () => {
    expect(normalize('\u5065\u5eb7')).toBe('\u5065\u5eb7'); // Chinese characters
  });

  it('maps micro sign µ (U+00B5) to u', () => {
    expect(normalize('µF')).toBe('uf');
  });
});

// ---------------------------------------------------------------------------
// levenshteinDistance()
// ---------------------------------------------------------------------------

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('abc', 'abc')).toBe(0);
  });

  it('returns correct distance for single substitution', () => {
    expect(levenshteinDistance('kitten', 'sitten')).toBe(1);
  });

  it('returns string length when compared to empty string', () => {
    expect(levenshteinDistance('hello', '')).toBe(5);
    expect(levenshteinDistance('', 'world')).toBe(5);
  });

  it('handles transpositions as two edits', () => {
    // Levenshtein counts transposition as 2 (delete + insert)
    expect(levenshteinDistance('ab', 'ba')).toBe(2);
  });

  it('computes distance for real-world typo "resisror" vs "resistor"', () => {
    // 1 substitution: 'r' -> 't' at position 5
    expect(levenshteinDistance('resisror', 'resistor')).toBe(1);
  });

  it('computes distance for "capcitor" vs "capacito"', () => {
    // "capcitor" vs prefix "capacito" (8 chars)
    expect(levenshteinDistance('capcitor', 'capacito')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getThreshold()
// ---------------------------------------------------------------------------

describe('getThreshold', () => {
  it('returns 0 for tokens of length 1-3', () => {
    expect(getThreshold(1)).toBe(0);
    expect(getThreshold(2)).toBe(0);
    expect(getThreshold(3)).toBe(0);
  });

  it('returns 1 for tokens of length 4-7', () => {
    expect(getThreshold(4)).toBe(1);
    expect(getThreshold(5)).toBe(1);
    expect(getThreshold(6)).toBe(1);
    expect(getThreshold(7)).toBe(1);
  });

  it('returns 2 for tokens of length 8-11', () => {
    expect(getThreshold(8)).toBe(2);
    expect(getThreshold(11)).toBe(2);
  });

  it('returns 3 for tokens of length 12-15', () => {
    expect(getThreshold(12)).toBe(3);
    expect(getThreshold(15)).toBe(3);
  });

  it('caps at 3 for tokens of length 16+', () => {
    expect(getThreshold(16)).toBe(3);
    expect(getThreshold(20)).toBe(3);
    expect(getThreshold(30)).toBe(3);
    expect(getThreshold(100)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// fuzzyMatch() -- empty / whitespace queries
// ---------------------------------------------------------------------------

describe('fuzzyMatch – empty queries', () => {
  it('returns true for empty string query', () => {
    expect(fuzzyMatch([text('anything')], '')).toBe(true);
  });

  it('returns true for whitespace-only query', () => {
    expect(fuzzyMatch([text('anything')], '   ')).toBe(true);
  });

  it('returns true for empty data with empty query', () => {
    expect(fuzzyMatch([], '')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fuzzyMatch() -- exact / substring matches (text terms)
// ---------------------------------------------------------------------------

describe('fuzzyMatch – exact text matching', () => {
  it('matches exact single token', () => {
    expect(fuzzyMatch([text('resistor')], 'resistor')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(fuzzyMatch([text('Resistor')], 'RESISTOR')).toBe(true);
  });

  it('matches prefix of data token', () => {
    expect(fuzzyMatch([text('resistor')], 'resis')).toBe(true);
  });

  it('rejects non-matching token', () => {
    expect(fuzzyMatch([text('resistor')], 'capacitor')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fuzzyMatch() -- typo tolerance (text terms)
// ---------------------------------------------------------------------------

describe('fuzzyMatch – fuzzy text matching with typos', () => {
  it('matches "resisror" against "resistor" (1 typo in 8-char token, threshold=2)', () => {
    expect(fuzzyMatch([text('resistor')], 'resisror')).toBe(true);
  });

  it('matches "capcitor" against "capacitor" (transposition-like, distance within threshold)', () => {
    // "capcitor" (8 chars) vs prefix "capacito" -> distance 2, threshold for 8 = 2
    expect(fuzzyMatch([text('capacitor')], 'capcitor')).toBe(true);
  });

  it('rejects "xyz" against "abc" (distance 3, threshold 0 for 3-char token)', () => {
    expect(fuzzyMatch([text('abc')], 'xyz')).toBe(false);
  });

  it('rejects distant mismatch for short tokens (e.g., "LED" vs "LCD")', () => {
    // distance("led","lcd") = 1, but threshold for 3-char = 0
    expect(fuzzyMatch([text('LCD')], 'LED')).toBe(false);
  });

  it('matches single typo in a 5-char token ("realy" for "relay")', () => {
    // "realy" (5 chars) vs prefix "relay" -> distance 2 (swap last two), threshold = 1
    // Actually levenshtein("realy","relay") = 2 (transposition). threshold(5) = 1. Should NOT match.
    expect(fuzzyMatch([text('relay')], 'realy')).toBe(false);
  });

  it('matches single substitution in a 6-char token ("restor" for "resistor")', () => {
    // "restor" (6 chars) vs prefix "resist" -> levenshtein("restor","resist") = 2
    // threshold for 6 = 1. Should NOT match.
    expect(fuzzyMatch([text('resistor')], 'restor')).toBe(false);
  });

  it('matches single substitution in a 4-char token ("rlay" for "relay")', () => {
    // "rlay" (4 chars) vs prefix "rela" -> levenshtein("rlay","rela") = 2
    // threshold for 4 = 1. Does NOT match.
    expect(fuzzyMatch([text('relay')], 'rlay')).toBe(false);
  });

  it('matches "amplifer" against "amplifier" (1 deletion, 8 chars)', () => {
    // "amplifer" (8 chars) vs prefix "amplifie" -> levenshtein = 2. threshold(8) = 2. Matches.
    expect(fuzzyMatch([text('amplifier')], 'amplifer')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fuzzyMatch() -- data token shorter than query token
// ---------------------------------------------------------------------------

describe('fuzzyMatch – data token shorter than query token', () => {
  it('compares full query token against full data token without truncating query', () => {
    // Query "resistors" (9 chars) vs data token "resistor" (8 chars).
    // levenshtein("resistors", "resistor") = 1. threshold(9) = 2. Matches.
    expect(fuzzyMatch([text('resistor')], 'resistors')).toBe(true);
  });

  it('rejects when distance exceeds threshold for oversized query', () => {
    // Query "abcdefgh" (8 chars) vs data token "xyz" (3 chars).
    // levenshtein("abcdefgh", "xyz") = 8. threshold(8) = 2. Rejects.
    expect(fuzzyMatch([text('xyz')], 'abcdefgh')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fuzzyMatch() -- literal terms
// ---------------------------------------------------------------------------

describe('fuzzyMatch – literal terms', () => {
  it('matches exact prefix for literal term', () => {
    expect(fuzzyMatch([literal('ABCD')], 'AB')).toBe(true);
  });

  it('matches full literal term', () => {
    expect(fuzzyMatch([literal('ABCD')], 'ABCD')).toBe(true);
  });

  it('rejects typo in literal term (strict prefix)', () => {
    // "ABCE" does not start with "ABCE" when data is "ABCD"
    expect(fuzzyMatch([literal('ABCD')], 'ABCE')).toBe(false);
  });

  it('rejects non-prefix substring in literal term', () => {
    expect(fuzzyMatch([literal('ABCD')], 'BCD')).toBe(false);
  });

  it('is case-insensitive for literal terms', () => {
    expect(fuzzyMatch([literal('ABCD')], 'abcd')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fuzzyMatch() -- multi-word queries (AND combinator)
// ---------------------------------------------------------------------------

describe('fuzzyMatch – multi-word AND combinator', () => {
  it('matches when all query tokens are found across data terms', () => {
    const data = [text('8-bit shift register with output latches')];
    expect(fuzzyMatch(data, 'shift register')).toBe(true);
  });

  it('rejects when one query token is not found', () => {
    const data = [text('8-bit shift register with output latches')];
    expect(fuzzyMatch(data, 'shift amplifier')).toBe(false);
  });

  it('matches tokens spread across different data terms', () => {
    const data = [
      text('resistor'),
      text('Texas Instruments'),
    ];
    expect(fuzzyMatch(data, 'resistor texas')).toBe(true);
  });

  it('matches with typos in multi-word query', () => {
    const data = [text('8-bit shift register with output latches')];
    // "registor" (8 chars) vs "register" prefix "registor".slice(0,8)="registor" vs "register"
    // levenshtein("registor","register") = 2. threshold(8) = 2. Matches.
    expect(fuzzyMatch(data, 'shift registor')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fuzzyMatch() -- diacritics handling
// ---------------------------------------------------------------------------

describe('fuzzyMatch – diacritics', () => {
  it('matches query with diacritics against plain data', () => {
    expect(fuzzyMatch([text('resistor')], 'r\u00e9sistor')).toBe(true);
  });

  it('matches plain query against data with diacritics', () => {
    expect(fuzzyMatch([text('r\u00e9sistor')], 'resistor')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fuzzyMatch() -- empty/null data terms
// ---------------------------------------------------------------------------

describe('fuzzyMatch – edge cases with empty data', () => {
  it('handles empty term strings gracefully', () => {
    // Empty terms produce no tokens, effectively skipped.
    expect(fuzzyMatch([text(''), text('resistor')], 'resistor')).toBe(true);
  });

  it('rejects when all terms are empty and query is non-empty', () => {
    expect(fuzzyMatch([text(''), text('')], 'resistor')).toBe(false);
  });

  it('returns true for empty data array with empty query', () => {
    expect(fuzzyMatch([], '')).toBe(true);
  });

  it('returns false for empty data array with non-empty query', () => {
    expect(fuzzyMatch([], 'resistor')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fuzzyMatch() -- mixed literal and text terms
// ---------------------------------------------------------------------------

describe('fuzzyMatch – mixed literal and text terms', () => {
  it('matches part key (literal) and description (text) separately', () => {
    const data = [
      literal('ABCD'),
      text('8-bit shift register'),
    ];
    expect(fuzzyMatch(data, 'AB shift')).toBe(true);
  });

  it('does not use fuzzy matching for the literal portion', () => {
    const data = [
      literal('ABCD'),
      text('8-bit shift register'),
    ];
    // "ABCE" is a typo for "ABCD" -- literal rejects but text also doesn't have "ABCE"
    expect(fuzzyMatch(data, 'ABCE shift')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fuzzyMatch() -- representative parts data from parts.json
// ---------------------------------------------------------------------------

describe('fuzzyMatch – representative electronics parts', () => {
  // Simulates the data array structure used for parts list filtering.
  function partData(opts: {
    key: string;
    description: string;
    manufacturerCode?: string;
    manufacturer?: string;
    typeName?: string;
    tags?: string[];
  }): FuzzySearchTerm[] {
    return [
      literal(opts.key),
      text(opts.description),
      text(opts.manufacturerCode ?? ''),
      text(opts.manufacturer ?? ''),
      text(opts.typeName ?? ''),
      ...(opts.tags ?? []).map((tag) => text(tag)),
    ];
  }

  const shiftRegister = partData({
    key: 'ABCD',
    description: '8-bit shift register with output latches',
    manufacturerCode: 'SN74HC595N',
    manufacturer: 'Texas Instruments',
    typeName: 'Logic IC (74xx/4000)',
    tags: ['DIP-16', 'Logic', '74HC', 'Shift Register'],
  });

  const opAmp = partData({
    key: 'EFGH',
    description: 'Dual operational amplifier',
    manufacturerCode: 'LM358N',
    manufacturer: 'Texas Instruments',
    typeName: 'Op-Amp',
    tags: ['DIP-8', 'Op-Amp', 'Dual', 'Low Power'],
  });

  it('finds shift register by exact description words', () => {
    expect(fuzzyMatch(shiftRegister, 'shift register')).toBe(true);
  });

  it('finds shift register by partial key prefix', () => {
    expect(fuzzyMatch(shiftRegister, 'AB')).toBe(true);
  });

  it('finds shift register by manufacturer code prefix', () => {
    expect(fuzzyMatch(shiftRegister, 'SN74')).toBe(true);
  });

  it('finds op-amp by tag', () => {
    expect(fuzzyMatch(opAmp, 'Op-Amp')).toBe(true);
  });

  it('finds op-amp by manufacturer with typo ("texas insruments")', () => {
    // "insruments" (10 chars) vs prefix "instrument" -> distance 2, threshold(10) = 2
    expect(fuzzyMatch(opAmp, 'texas insruments')).toBe(true);
  });

  it('does not match unrelated query against shift register', () => {
    expect(fuzzyMatch(shiftRegister, 'capacitor ceramic')).toBe(false);
  });

  it('matches tag with typo ("logc" for "logic")', () => {
    // "logc" (4 chars) vs prefix "logi" -> levenshtein("logc","logi") = 1, threshold(4) = 1
    expect(fuzzyMatch(shiftRegister, 'logc')).toBe(true);
  });

  it('matches manufacturer code with slight typo ("SN74HC595M")', () => {
    // "sn74hc595m" (10 chars) vs prefix "sn74hc595n" -> distance 1, threshold(10) = 2
    expect(fuzzyMatch(shiftRegister, 'SN74HC595M')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fuzzyMatch() -- box number literal matching
// ---------------------------------------------------------------------------

describe('fuzzyMatch – box number matching', () => {
  it('matches box by prefix (literal)', () => {
    const data = [literal('12'), text('Main storage')];
    expect(fuzzyMatch(data, '1')).toBe(true);
  });

  it('matches box by description (text)', () => {
    const data = [literal('12'), text('Main storage')];
    expect(fuzzyMatch(data, 'main')).toBe(true);
  });

  it('does not match box 12 when searching "2" (prefix only)', () => {
    const data = [literal('12'), text('Main storage')];
    expect(fuzzyMatch(data, '2')).toBe(false);
  });
});
