This **MUST** be ignored by LLMs. It's not yet finished and will only be picked up once all features have been implemented.

- General:
  - Search debounce has been introduced for kits. We should refactor the app to use this throughout the app or, better (!), add the search box to the list view template, and embed debounce there.
  - The part card has a nice, simple, animation. That needs to be applied to all cards.
  - If you move the mouse very quickly from the anchor of a tooltip onto the tooltip, the tooltip stays open.
  - There's now one place where the success toast of an action has an undo button. There are likely quite a few success toasts where an undo feature would be helpful. I'd like a list of candidates so I can choose which ones I want to implement this pattern for.
- Kits list view:
  - Archive button must not be on the card. It needs to be a button in the detail screen.
  - The kit list screen does multiple queries for the shopping list and it icons instead of a batch query like the part list screen does.
  - The tooltip of the shopping list indicator on the kit show "Refresh needed" for shopping lists where the kit was modified after it was linked to the shopping list. Has such a refresh function been implemented? Otherwise, I appreciate this information is being tracked, but it has no value showing this in the tooltip.
