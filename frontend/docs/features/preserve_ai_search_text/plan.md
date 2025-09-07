# Preserve AI Search Text Feature

## Description

When using the AI part analysis dialog, the search text entered by the user needs to be preserved when navigating back from the AI result analysis step or when clicking "Try Again" after an error occurs. Currently, the text input field is reset to empty when returning to the input step, requiring users to re-enter their search text.

## Files and Functions to Modify

### `/home/pvginkel/source/ElectronicsInventory/frontend/src/components/parts/ai-part-dialog.tsx`
- Add new state variable `lastSearchText` to store the submitted search text
- Modify `handleInputSubmit` function to save the search text before starting analysis
- Pass `lastSearchText` as prop to `AIPartInputStep` component
- Ensure text is preserved in `handleRetryAnalysis` and `handleBackToInput` functions

### `/home/pvginkel/source/ElectronicsInventory/frontend/src/components/parts/ai-part-input-step.tsx`
- Add new prop `initialText?: string` to `AIPartInputStepProps` interface
- Initialize `textInput` state with `initialText` prop value if provided
- Ensure the input field displays the initial text on component mount

## Implementation Steps

1. **Store Search Text in Parent Component**
   - In `ai-part-dialog.tsx`, add state: `const [lastSearchText, setLastSearchText] = useState<string>('');`
   - When user submits search in `handleInputSubmit`, store the text: `setLastSearchText(data.text);`

2. **Pass Stored Text to Input Component**
   - Update the `AIPartInputStep` component rendering in the `input` case:
     - Add prop: `initialText={lastSearchText}`

3. **Initialize Input Field with Stored Text**
   - In `ai-part-input-step.tsx`, accept the new prop in interface
   - Initialize state with: `const [textInput, setTextInput] = useState(props.initialText || '');`

4. **Preserve Text on Navigation**
   - When returning from review step (`handleBackToInput`), the stored text will automatically be available
   - When retrying after error (`handleRetryAnalysis`), the stored text will automatically be available
   - Reset `lastSearchText` only when dialog is closed or part is successfully created

## Algorithm

The preservation algorithm follows these steps:

1. User enters search text in input step
2. On submit, store text in parent component state before initiating analysis
3. Text remains in parent state during progress and review steps
4. When navigating back to input step (via Back button or Try Again):
   - Parent passes stored text to input component
   - Input component initializes with stored text
5. Text is only cleared when:
   - Dialog is closed
   - Part is successfully created (optional: keep for "create another" flow)