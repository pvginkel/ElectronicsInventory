This **MUST** be ignored by LLMs. It's not yet finished and will only be picked up once all features have been implemented.

- General:
  - Search debounce has been introduced for kits. We should refactor the app to use this throughout the app or, better (!), add the search box to the list view template, and embed debounce there.
  - The part card has a nice, simple, animation. That needs to be applied to all cards.
- Kits list view:
  - Archive button must not be on the card. It needs to be a button in the detail screen.
  - The kit list screen does multiple queries for the shopping list and it icons instead of a batch query like the part list screen does.