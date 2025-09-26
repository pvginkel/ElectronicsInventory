# Fake Image Endpoint Plan

Add a `/api/testing/fake-image` endpoint that Playwright tests can call (e.g., `/api/testing/fake-image?text=abc`) to download a PNG that shows the requested text in black over a light blue background.

## Relevant Files
- `app/api/testing.py` — extend the testing blueprint with the new `/fake-image` route and ensure it stays behind the existing testing-mode guard.
- `app/services/testing_service.py` (or a brief new utility under `app/utils/` if preferred) — host the image generation logic so the API layer remains thin; expose a method that returns PNG bytes for a given text string. The image size must be 400px x 100px, the text must be centered both horizontally and vertically with a height of 60px. It's not a problem if the text is clipped. Use #2478BD for the background color and the default sans-serif font (Liberation Sans on the container).
- `app/services/container.py` — wire any new helper/service into the dependency-injector container if image generation moves into a dedicated service or utility provider.
- `tests/api/test_testing.py` — add Playwright-oriented tests that call the new endpoint, assert HTTP metadata, and validate the generated PNG contents.

## Implementation Steps
1. **Confirm Blueprint Context**: Review `app/api/testing.py` to align decorators (`@api.validate`, `@handle_api_errors`, `@inject`) and reuse the existing `testing_bp.before_request` guard so `/api/testing/fake-image` is only available when `FLASK_ENV=testing`.
2. **Build Image Generation Helper**: Using Pillow, create a light blue (#2478BD) background image, render the request text in solid black with the default sans-serif font sized to approximately 60px height, calculate centered positioning, and return PNG bytes via an in-memory buffer.
3. **Expose Generation Through Service/Utility**: Add a method such as `TestingService.create_fake_image(text: str) -> bytes` (or equivalent utility function) so the API route just invokes it and streams the result; ensure no HTTP-specific logic leaks into the service.
4. **Implement API Response**: In `app/api/testing.py`, add the new `@testing_bp.route("/fake-image")` handler that requires the `text` query parameter, calls the helper/service, and returns a `Response` with `image/png` content type, a deterministic filename (e.g., `fake-image.png`), and sensible cache headers for test stability.
5. **Extend Dependency Wiring**: If a new helper/service is introduced, register it in `ServiceContainer` and update dependency wiring so it can be injected into the route.
6. **Write Automated Tests**: In `tests/api/test_testing.py`, add cases that (a) call `/api/testing/fake-image?text=abc` and confirm status 200 with PNG content and (b) open the response via Pillow to assert the background pixel is light blue and the text renders in black (checking a few sampled pixels).
7. **Run Tooling**: Execute `poetry run pytest` (and, if new dependencies or type hints are involved, `poetry run ruff check .` and `poetry run mypy .`) to ensure the plan can be delivered without regressions.
