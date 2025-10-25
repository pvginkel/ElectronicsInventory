This **MUST** be ignored by LLMs. It's not yet finished and will only be picked up once all features have been implemented.

- General:
  - Search debounce has been introduced for kits. We should refactor the app to use this throughout the app or, better (!), add the search box to the list view template, and embed debounce there.
  - The part card has a nice, simple, animation. That needs to be applied to all cards.
  - If you move the mouse very quickly from the anchor of a tooltip onto the tooltip, the tooltip stays open.
  - There's now one place where the success toast of an action has an undo button. There are likely quite a few success toasts where an undo feature would be helpful. I'd like a list of candidates so I can choose which ones I want to implement this pattern for.
  - Very large toast texts move the close button out of the toast. Specifically this text:

    [{"type":"greater_than_equal","loc":["build_target"],"msg":"Input should be greater than or equal to 1","input":0,"url":"https://errors.pydantic.dev/2.11/v/greater_than_equal"}]
  - Toasts still not always auto close. Sometimes they do, but regularly I see toasts stay open indefinitely.
  - Visualization of badges and link chips differ per page. This applies to kit, pick list, shopping list and part detail views. I want these to look the same. Firstly, link chips needs to move out of the header. I like where they are in the part detail view. Second, I only want the key and status badge next to the title. All attribute badges (Build target e.g.) need to go below the title in the detail-screen.metadata affordance. I also want them to look the same, so all of them are badges, with a color, formatted as "<key>: <value>".
  - All action bars in all DetailScreenLayout usages need to be reviewed. I don't ever want the buttons to wrap. All wrapper divs seem to have the class flex-wrap. If I remove that, the labels of the buttons wrap. Neither the buttons nor the labels on the buttons must wrap.
  - The bottom rounded corners of the tables on the pick list detail view and the kit detail view are not visible. This doesn't happen on the shopping list. It's caused I believe by the "bg-background" class on the row. I get the feeling the reason for the classes is to draw divider lines. The pick list however uses the "divide-y divide-border/70" classes for this. If I remove the bg-background there the issue goes away.
  - There are a number of wrappers around Badge. They basically all just manage formatting of the badge. This should be abstracted into a reusable component. Examples are: DetailBadge in src/components/pick-lists/pick-list-detail.tsx, SummaryBadge in src/components/kits/kit-detail.tsx, GroupSummaryBadge in src/components/pick-lists/pick-list-lines.tsx. I would prefer a few helper components next to the Badge component in src/components/ui, or extension to the Badge component to support these use cases.4
  - I want all button labels in the app reviewed. They should all have the format "<verb> <noun>" like "Order Stock" and "Edit List". They should describe the business function (so not "Create Shopping List" but "Order Stock") and they should be upper case first on all words. This include buttons like the "+ Add Part" button on the kit BOM table. The contributor documentation or AGENTS.md also need to be updated with this rule.
  - If I click on the anchor of something that has a tooltip (at least on the pick list icon on the kit card on the kit list screen), the tooltip stays open after I move the mouse off of the icon. Possibly this is to support mobile devices, but I would like the mouse click to be excluded from this behavior.
  - There's missing contributor guidance that states that no tooltip should ever have navigation components or otherwise anything that we can interact with.
- Kits list view:
  - Archive button must not be on the card. It needs to be a button in the detail screen.
  - The kit list screen does multiple queries for the shopping list and it icons instead of a batch query like the part list screen does.
  - The tooltip of the shopping list indicator on the kit show "Refresh needed" for shopping lists where the kit was modified after it was linked to the shopping list. Has such a refresh function been implemented? Otherwise, I appreciate this information is being tracked, but it has no value showing this in the tooltip.
  - There's a bug in the screen. If the content of the DetailScreenLayout component grows large enough to cause a scrollbar to appear, a scrollbar also appears at the top level of the HTML page. The sizes are related. It only happens on the kit detail view, not on the part detail view for example.
- Kit detail view:
  - The unlink icon must only be shown when the mouse is over the shopping cart link chip or when it has focus.
- Shopping cart detail view:
  - The kit link chip must have an unlink feature like the shopping cart chip on the kit detail view.
- Pick list detail view:
  - It must be possible to delete pick lists.
- Part detail view:
  - The "Refresh" menu option in the actions panel needs to be removed.