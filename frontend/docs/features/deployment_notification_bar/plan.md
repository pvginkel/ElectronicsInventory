# Deployment Notification Bar - Technical Plan

## Brief Description
Implement a notification bar that appears at the top of the application to notify users when "A new version of the app is available. Click reload to reload the app." with "reload" being a clickable link that performs a full reload. This feature is primarily useful for production deployments (development uses HMR which bypasses this mechanism).

## Files to Create or Modify

### New Files to Create
- `src/contexts/deployment-context.tsx` - React context for managing deployment notification state
- `src/components/ui/deployment-notification-bar.tsx` - UI component rendering the notification bar
- `src/hooks/use-deployment-notification.ts` - Custom hook for deployment detection logic

### Files to Modify
- `src/routes/__root.tsx` - Add DeploymentProvider wrapper and DeploymentNotificationBar component to root layout
- `vite.config.ts` - Add build plugin to generate version.json with git commit ID during build
- `package.json` - Update build script to include version generation step

## Algorithms and Implementation Steps

### Deployment Detection Algorithm
1. **Version File Generation**: Vite build plugin generates `/version.json` with git commit ID during build process
2. **Initial Version Load**: App loads version.json on startup to get current deployed version
3. **Periodic Checking**: Use setInterval every 5 seconds to poll version.json for changes (primarily for production deployments)
4. **Tab Focus Checking**: Add window focus event listener to immediately check for updates when tab gains focus (primary trigger for quick feedback)
5. **Cache Busting**: Add timestamp query parameter to version.json requests to prevent browser caching
6. **Detection Method**: Compare loaded version against current version.json response
7. **Error Handling**: Silently ignore network failures when fetching version.json (users will notice updates through normal usage)
8. **State Update**: Update context state when new version detected

### Notification Bar Display Logic
1. **Positioning**: Fixed bar at top of viewport, above all content including sidebar
2. **Content**: Display text "A new version of the app is available. Click reload to reload the app." with "reload" as clickable link
3. **Actions**: Provide click handler on "reload" link for full page reload using `window.location.reload()`
4. **Persistence**: Show until user clicks reload (not dismissable)

### App Reload Implementation
- Use `window.location.reload()` to perform complete page refresh
- Ensures all cached assets are cleared and latest version loaded

### Context State Management
- `isNewVersionAvailable`: boolean flag for showing notification bar
- `currentVersion`: git commit ID from version.json
- `checkForUpdates()`: function to manually trigger version check
- `reloadApp()`: function to perform full page reload
- Focus event handler to check for updates when tab gains focus

## Integration into Root Layout

### Root Layout Modification (`src/routes/__root.tsx`)
- Wrap existing layout with `DeploymentProvider`
- Add `DeploymentNotificationBar` component positioned above current content structure
- Ensure proper z-index and responsive behavior

### Component Architecture
- `DeploymentNotificationBar` receives state from `DeploymentContext`
- Bar slides down from top when `isNewVersionAvailable` is true  
- Displays text with "reload" as clickable link that calls `reloadApp()` from context
- Not dismissable - persists until user clicks reload link
- Styled consistently with existing UI theme and toast components

### Version File Structure
- `/version.json` generated during build with structure: `{"version": "<git-commit-id>"}`
- Example: `{"version": "49f9365"}` (7-character git commit hash)
- Client-side cache busting using timestamp query parameters: `version.json?t=<timestamp>`
- Polling checks compare current loaded version with version.json response

### Build Process Implementation
- **Vite Plugin**: Create custom Vite plugin that runs `git rev-parse --short HEAD` during build
- **Plugin Execution**: Plugin writes version.json to dist/ folder with current git commit
- **Integration**: Plugin hooks into Vite's `generateBundle` phase to ensure version.json is included in build output
- **Script Update**: `pnpm build` automatically includes version generation without additional steps