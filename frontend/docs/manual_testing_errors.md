I'm manually testing the code and I've found the following issues:

* General:
  * Can you check all user visible text like form titles, tile labels, button texts, etc and bring them in line? I'm seeing some inconsistencies.
* Main UI:
  * The top bar with the search box and scan and add part buttons needs to be removed completely.
  * The search function from the sidebar needs to be removed. The search function in the parts screen is fine.
  * Storage has a breadcrumb bar but parts does not. Please add the breadcrumb bar to parts also. This should be the standard for the entity UI.
  * Scrollbars aren't styled. This is especially visible in dark mode.
* Create part:
  * Entering a type name without selecting anything in the dialog will leave the type empty. It should clear the text field when it looses focus instead.
* Part screen:
  * Adding stock to a part with a box number that doesn't exist does return a 404 from the API but gives no visual feedback. It just "doesn't work".
  * Clicking save when committing a change to the inventory of a location doesn't do anything. There's no call to the backend, but there is a reload of the locations.
  * Bring the UI of this screen in line with the UI of the box screen. I already mentioned adding the breadcrumb bar. Also change the visual style of the buttons and add a "Delete Part" button. I want the screens to look similar. Just use the whole layout. Multi column, information to the left, stock to the right.
* Part list:
  * Search box can take op more space.
  * "Total Qty" (should be named "Total Quantity") does not reflect the actual quantity. It's always 0.
  * "Manufacturer" should be "Manufacturer Code".
  * No search results on search shows the "Add First Part" button. That's incorrect.
* Storage list:
  * Usage isn't updated with the real usage.
  * Deleting a box doesn't show an error message. The backend returns a 409 with an error code in the response. I don't see it on the screen. This hasn't been implemented generically?
* Storage box:
  * Please change the title of the view box from "Box <number> \n Description" to "#<number> Description".
  * Location information is not updated. They all show empty.
  * The location name (e.g. 1-1) in the location row can be removed.
