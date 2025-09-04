# Color Scheme Enhancement Plan

## Brief Description

Add subtle color tints to detail and editor screens to improve visual hierarchy and reduce monotony, especially in dark mode. The enhancement will introduce semantic color coding for different content areas while maintaining the existing design system's professional aesthetic.

## Files to Modify

### Core Style Configuration
- `src/index.css` - Add new CSS variables for semantic content colors
- `tailwind.config.js` - Extend theme with new color utilities

### Component Files to Update

#### Detail Screens
- `src/components/parts/part-details.tsx` - Apply section-specific background tints
- `src/components/boxes/box-details.tsx` - Add visual differentiation to sections
- `src/components/types/type-details.tsx` - Apply consistent color scheme

#### Form/Editor Screens  
- `src/components/parts/part-form.tsx` - Color-code form sections
- `src/components/boxes/box-form.tsx` - Apply section backgrounds
- `src/components/types/type-form.tsx` - Consistent form section styling

#### UI Components
- `src/components/ui/card.tsx` - Add new card variants for different content types

## Implementation Details

### Step 1: Define Semantic Color Variables

Add new CSS custom properties to `src/index.css` for both light and dark modes:

**Content Area Colors:**
- Info sections (blue tint): Technical specifications, documentation
- Success sections (green tint): Manufacturer/seller information, availability
- Warning sections (amber tint): Physical specifications, quantities
- Neutral sections: Basic information, descriptions

**Color Values:**
- Light mode: 97-98% lightness for subtle backgrounds
- Dark mode: 8-12% lightness to maintain contrast
- All colors maintain existing hue directions from the current palette

### Step 2: Create Tailwind Utilities

Extend `tailwind.config.js` to expose new color variables as utility classes:
- `bg-content-info` / `dark:bg-content-info-dark`
- `bg-content-success` / `dark:bg-content-success-dark`
- `bg-content-warning` / `dark:bg-content-warning-dark`
- `bg-section-*` variants for form sections

### Step 3: Update Detail Components

**Part Details (`part-details.tsx`):**
- Technical Specifications section: Apply info-tinted background
- Manufacturer Info card: Apply success-tinted background
- Quantity/Location cards: Apply warning-tinted background for low stock
- Documentation section: Subtle info tint

**Box Details (`box-details.tsx`):**
- Utilization meter: Color-coded based on percentage (green→yellow→red)
- Location grid: Alternating row tints for better scanability
- Stats cards: Different tints for different metrics

### Step 4: Update Form Components

**Part Form (`part-form.tsx`):**
- Basic Information section: Neutral (current)
- Physical Specifications section: Warning tint (amber)
- Technical Specifications section: Info tint (blue)
- Seller Information section: Success tint (green)
- Each section gets subtle border-left accent in matching color

**Box Form (`box-form.tsx`):**
- Configuration section: Info tint
- Capacity settings: Warning tint

### Step 5: Enhance Card Component

Update `card.tsx` to support new variants:
- Add `variant` prop with options: 'default', 'info', 'success', 'warning', 'technical'
- Each variant applies appropriate background and border colors
- Maintain existing hover states with adjusted colors

## Implementation Phases

### Phase 1: Foundation (CSS Variables & Tailwind Config)
1. Define all color variables in `src/index.css`
2. Extend Tailwind configuration
3. Test color values in both light and dark modes

### Phase 2: Detail Screens
1. Update part-details.tsx with section colors
2. Update box-details.tsx with utilization colors
3. Update type-details.tsx for consistency

### Phase 3: Form Screens
1. Update part-form.tsx with section backgrounds
2. Update box-form.tsx consistently
3. Update type-form.tsx consistently

### Phase 4: Component Library
1. Enhance Card component with variants
2. Create reusable FormSection wrapper component if patterns emerge
3. Update any other shared components as needed

## Color Semantics Guide

- **Blue tints**: Technical information, specifications, documentation
- **Green tints**: Availability, seller info, positive states
- **Amber/Yellow tints**: Physical attributes, quantities, neutral states
- **Red tints**: Warnings, low stock, errors (sparingly used)
- **Purple tints**: Category-specific information (optional)

## Accessibility Considerations

- All background tints maintain WCAG AA contrast ratios
- Text remains primary foreground color for readability
- Interactive elements keep existing focus states
- Color is never the only indicator of information