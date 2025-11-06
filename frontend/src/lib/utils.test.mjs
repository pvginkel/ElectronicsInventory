// Unit tests for cn() utility to verify tailwind-merge 3.x compatibility
// Run with: node src/lib/utils.test.mjs

import { cn } from './utils.ts';

// Simple test runner
let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`✓ ${description}`);
    passed++;
  } catch (error) {
    console.error(`✗ ${description}`);
    console.error(`  ${error.message}`);
    failed++;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected "${expected}", got "${actual}"`);
      }
    },
    toContain(substring) {
      if (!actual.includes(substring)) {
        throw new Error(`Expected "${actual}" to contain "${substring}"`);
      }
    },
    not: {
      toContain(substring) {
        if (actual.includes(substring)) {
          throw new Error(`Expected "${actual}" NOT to contain "${substring}"`);
        }
      }
    }
  };
}

console.log('\n🧪 Testing cn() utility with tailwind-merge 3.x\n');

// Baseline TailwindCSS merging tests
test('later class wins for same utility group', () => {
  expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
});

test('merges different utility groups', () => {
  const result = cn('px-4 py-2', 'px-6');
  expect(result).toContain('px-6');
  expect(result).toContain('py-2');
});

test('handles conditional classes', () => {
  const result = cn('text-sm', false && 'text-lg', 'font-bold');
  expect(result).toContain('text-sm');
  expect(result).toContain('font-bold');
  expect(result).not.toContain('text-lg');
});

test('handles undefined values', () => {
  const result = cn('flex', undefined, 'gap-4');
  expect(result).toContain('flex');
  expect(result).toContain('gap-4');
});

test('handles null values', () => {
  const result = cn('flex', null, 'gap-4');
  expect(result).toContain('flex');
  expect(result).toContain('gap-4');
});

test('handles empty strings', () => {
  const result = cn('flex', '', 'gap-4');
  expect(result).toContain('flex');
  expect(result).toContain('gap-4');
});

// Custom utility merging tests (TailwindCSS v4 @utility directive)
test('preserves custom shadow utilities when merged with standard classes', () => {
  const result = cn('shadow-md', 'shadow-soft');
  expect(result).toContain('shadow-soft');
});

test('preserves category utilities when merged with standard classes', () => {
  const result = cn('bg-blue-500', 'category-resistor');
  expect(result).toContain('category-resistor');
});

test('preserves ai-glare utility with positioning classes', () => {
  const result = cn('relative', 'ai-glare');
  expect(result).toContain('ai-glare');
});

test('preserves transition-smooth utility', () => {
  const result = cn('transition', 'transition-smooth');
  expect(result).toContain('transition-smooth');
});

// Custom breakpoint support tests
test('preserves custom 3xl: breakpoint classes', () => {
  const result = cn('text-sm', '3xl:text-lg');
  expect(result).toContain('3xl:text-lg');
});

// Complex merging scenarios
test('merges multiple utility groups correctly', () => {
  const result = cn('p-4 text-sm bg-red-500', 'px-6 bg-blue-500');
  expect(result).toContain('px-6');
  expect(result).toContain('bg-blue-500');
  expect(result).toContain('text-sm');
  // Note: py-2 from p-4 should remain but px-4 should be replaced by px-6
});

test('handles responsive variants', () => {
  const result = cn('text-sm md:text-base', 'lg:text-lg');
  expect(result).toContain('text-sm');
  expect(result).toContain('md:text-base');
  expect(result).toContain('lg:text-lg');
});

test('handles state variants', () => {
  const result = cn('hover:bg-gray-100', 'focus:bg-gray-200');
  expect(result).toContain('hover:bg-gray-100');
  expect(result).toContain('focus:bg-gray-200');
});

// Results summary
console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
