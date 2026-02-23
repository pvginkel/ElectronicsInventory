/**
 * Fuzzy search matching for the Electronics Inventory search boxes.
 *
 * Replaces exact substring matching with a typo-tolerant algorithm that uses
 * prefix-Levenshtein distance for text terms and strict prefix matching for
 * literal terms (part keys, box numbers).
 *
 * Algorithm overview:
 *   1. Normalize query and data terms (lowercase + strip diacritics).
 *   2. Tokenize both sides by whitespace.
 *   3. For each query token, find at least one matching data token across all terms (OR within terms).
 *   4. All query tokens must match (AND combinator).
 *   5. Literal terms use strict prefix match; text terms use prefix-Levenshtein.
 */

// --- Types ---

export type FuzzyTermType = 'literal' | 'text';

export interface FuzzySearchTerm {
  term: string;
  type: FuzzyTermType;
}

// --- Normalization ---

/**
 * Lowercase and strip combining diacritical marks so that
 * "Resume" matches "resume" and "resistor" matches "resistor".
 */
export function normalize(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// --- Tokenization ---

/** Split a string into non-whitespace tokens. Returns an empty array for blank input. */
function tokenize(str: string): string[] {
  return str.match(/\S+/g) ?? [];
}

// --- Levenshtein distance ---

/**
 * Classic dynamic-programming Levenshtein distance.
 * Uses a single-row optimization for O(min(m,n)) space.
 */
export function levenshteinDistance(a: string, b: string): number {
  // Ensure `a` is the shorter string for space optimization.
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const aLen = a.length;
  const bLen = b.length;

  // Previous and current row of the DP matrix.
  let prev = new Array<number>(aLen + 1);
  let curr = new Array<number>(aLen + 1);

  // Base case: distance from empty prefix of `b` to each prefix of `a`.
  for (let i = 0; i <= aLen; i++) {
    prev[i] = i;
  }

  for (let j = 1; j <= bLen; j++) {
    curr[0] = j;
    for (let i = 1; i <= aLen; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1,      // insertion
        prev[i] + 1,          // deletion
        prev[i - 1] + cost,   // substitution
      );
    }
    // Swap rows.
    [prev, curr] = [curr, prev];
  }

  return prev[aLen];
}

// --- Threshold ---

/**
 * Map query-token length to the maximum tolerable Levenshtein distance.
 *
 * Formula: min(floor(length / 4), 3)
 *   1-3 chars   -> 0 typos (exact prefix required)
 *   4-7 chars   -> 1 typo
 *   8-11 chars  -> 2 typos
 *   12+ chars   -> 3 typos (capped)
 *
 * The cap at 3 prevents long tokens that share a common prefix from
 * matching each other (e.g. "QA-Alpha" vs "QA-Beta" at 20+ chars would
 * otherwise get a threshold of 5, producing false positives).
 *
 * Experimentally validated against representative parts data.
 */
export function getThreshold(queryTokenLength: number): number {
  return Math.min(Math.floor(queryTokenLength / 4), 3);
}

// --- Core match logic ---

/**
 * Determine whether a single query token matches a single data token
 * under the rules for the given term type.
 */
function tokenMatches(queryToken: string, dataToken: string, termType: FuzzyTermType): boolean {
  if (termType === 'literal') {
    // Strict prefix match for structured identifiers (part keys, box numbers).
    return dataToken.startsWith(queryToken);
  }

  // Text terms: prefix-Levenshtein matching.
  let candidate: string;
  if (dataToken.length >= queryToken.length) {
    // Compare query token against the equal-length prefix of the data token.
    candidate = dataToken.slice(0, queryToken.length);
  } else {
    // Data token is shorter than query token -- compare full strings.
    candidate = dataToken;
  }

  const distance = levenshteinDistance(queryToken, candidate);
  return distance <= getThreshold(queryToken.length);
}

// --- Public API ---

/**
 * Fuzzy match: returns `true` when the record described by `data` matches the `query`.
 *
 * - Empty/whitespace-only queries match everything.
 * - Every query token must match at least one data token from any term (AND combinator).
 * - Literal terms require an exact prefix match.
 * - Text terms allow typos via prefix-Levenshtein within a length-derived threshold.
 */
export function fuzzyMatch(data: FuzzySearchTerm[], query: string): boolean {
  const normalizedQuery = normalize(query);
  const queryTokens = tokenize(normalizedQuery);

  // Empty query matches everything.
  if (queryTokens.length === 0) {
    return true;
  }

  // Pre-tokenize all data terms once.
  const dataEntries = data.map((entry) => ({
    tokens: tokenize(normalize(entry.term)),
    type: entry.type,
  }));

  // AND combinator: every query token must match at least one data token.
  return queryTokens.every((qToken) =>
    dataEntries.some((entry) =>
      entry.tokens.some((dToken) => tokenMatches(qToken, dToken, entry.type)),
    ),
  );
}
