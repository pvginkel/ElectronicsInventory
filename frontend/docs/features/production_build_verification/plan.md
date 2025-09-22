# Production Build Verification - Technical Plan

## Overview
Implement verification that test instrumentation code is mostly excluded from production builds by checking for common test markers and patterns, ensuring minimal performance impact from test-related code in production bundles.

## Files to Create or Modify

### Build Configuration
- `vite.config.ts` - Update build configuration to leverage existing tree-shaking
- `package.json` - Add build verification script to run after `pnpm build`

### Verification Scripts
- `scripts/verify-production-build.js` - New script to check for test markers in built files

## Implementation Steps

### Phase 1: Build-Time Optimization

1. **Leverage existing Vite tree-shaking**
   - Update `vite.config.ts` to define `isTestMode()` as `false` in production builds
   - This will allow Rollup's dead code elimination to remove test code blocks
   - No complex module replacement needed - rely on existing build optimizations

2. **Update test mode detection**
   - Ensure `src/lib/config/test-mode.ts` uses `import.meta.env.VITE_TEST_MODE`
   - Let Vite's define plugin replace this with `false` in production builds

### Phase 2: Build Verification

1. **Create verification script**
   - Parse production build output in `dist/assets/*.js`
   - Search for key test markers:
     - `TEST_EVT` string literals
     - `emitTestEvt` function calls
     - `window.__TEST_SIGNALS__` references
     - `src/lib/test/` path strings
   - Return non-zero exit code if markers found (warning, not error)
   - Generate simple console report of findings

2. **Integrate with build process**
   - Add verification as post-build step in `package.json`
   - Run automatically after `pnpm build` completes
   - Log results but don't fail the build (informational only)

### Phase 3: Runtime Verification (Optional)

1. **Simple production test**
   - Add optional Playwright test that builds in production mode
   - Verify `isTestMode()` returns false
   - Check that `window.__TEST_SIGNALS__` is undefined
   - Confirm no TEST_EVT emissions in console

### Phase 4: Docker Integration

1. **Dockerfile verification**
   - Add verification step after `RUN pnpm build` in Dockerfile
   - Run `pnpm verify:build` to check for test markers
   - Continue build even if markers found (informational only)

## Algorithm Details

### Test Marker Detection (Simple String Search)
```
1. Read all .js files from dist/assets/
2. For each file, search for these string patterns:
   - "TEST_EVT"
   - "emitTestEvt"
   - "__TEST_SIGNALS__"
   - "src/lib/test/"
3. Report findings:
   - Count of occurrences per marker
   - File names where markers were found
   - Total markers across all files
4. Exit with code 0 (success) regardless of findings
   - This is informational, not a build failure
```

### Build Configuration (Minimal Changes)
```
1. Update vite.config.ts define option:
   - Set VITE_TEST_MODE to undefined in production
   - This allows existing tree-shaking to work
2. Rely on existing Rollup optimizations:
   - Dead code elimination already removes if (false) blocks
   - No need for complex module replacements
```

## Success Criteria

- Most test code removed from production bundles (verified by marker search)
- Verification script runs automatically after `pnpm build`
- No significant test markers (TEST_EVT, emitTestEvt, etc.) in production files
- Build process remains simple and maintainable
- No build failures from verification - informational reporting only