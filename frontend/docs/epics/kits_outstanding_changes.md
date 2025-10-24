This **MUST** be ignored by LLMs. It's not yet finished and will only be picked up once all features have been implemented.

- General:
  - Search debounce has been introduced for kits. We should refactor the app to use this throughout the app or, better (!), add the search box to the list view template, and embed debounce there.
  - The part card has a nice, simple, animation. That needs to be applied to all cards.
  - If you move the mouse very quickly from the anchor of a tooltip onto the tooltip, the tooltip stays open.
  - There's now one place where the success toast of an action has an undo button. There are likely quite a few success toasts where an undo feature would be helpful. I'd like a list of candidates so I can choose which ones I want to implement this pattern for.
  - Very large toast texts move the close button out of the toast. Specifically this text:

    [{"type":"greater_than_equal","loc":["build_target"],"msg":"Input should be greater than or equal to 1","input":0,"url":"https://errors.pydantic.dev/2.11/v/greater_than_equal"}]
  - Visualization of badges and link chips differ per page. This applies to kit, pick list, shopping list and part detail views. I want these to look the same. Firstly, link chips needs to move out of the header. I like where they are in the part detail view. Second, I only want the key and status badge next to the title. All attribute badges (Build target e.g.) need to go below the title in the detail-screen.metadata affordance. I also want them to look the same, so all of them are badges, with a color, formatted as "<key>: <value>".
  - All action bars in all DetailScreenLayout usages need to be reviewed. I don't ever want the buttons to wrap. All wrapper divs seem to have the class flex-wrap. If I remove that, the labels of the buttons wrap. Neither the buttons nor the labels on the buttons must wrap.
  - The bottom rounded corners of the tables on the pick list detail view and the kit detail view are not visible. This doesn't happen on the shopping list. It's caused I believe by the "bg-background" class on the row. I get the feeling the reason for the classes is to draw divider lines. The pick list however uses the "divide-y divide-border/70" classes for this. If I remove the bg-background there the issue goes away.
- Kits list view:
  - Archive button must not be on the card. It needs to be a button in the detail screen.
  - The kit list screen does multiple queries for the shopping list and it icons instead of a batch query like the part list screen does.
  - The tooltip of the shopping list indicator on the kit show "Refresh needed" for shopping lists where the kit was modified after it was linked to the shopping list. Has such a refresh function been implemented? Otherwise, I appreciate this information is being tracked, but it has no value showing this in the tooltip.
  - There's a bug in the screen. If the content of the DetailScreenLayout component grows large enough to cause a scrollbar to appear, a scrollbar also appears at the top level of the HTML page. The sizes are related. It only happens on the kit detail view, not on the part detail view for example.