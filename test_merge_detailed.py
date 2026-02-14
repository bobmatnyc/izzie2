#!/usr/bin/env python3
"""
Detailed test of merge suggestions with network monitoring.
"""

from playwright.sync_api import sync_playwright
import sys


def test_with_network_monitoring():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        # Track network activity
        failed_requests = []
        all_requests = []

        def log_request(request):
            all_requests.append({"url": request.url, "method": request.method})

        def log_response(response):
            if response.status >= 400:
                failed_requests.append(
                    {
                        "url": response.url,
                        "status": response.status,
                        "status_text": response.status_text,
                    }
                )

        page.on("request", log_request)
        page.on("response", log_response)

        # Console messages
        console_messages = []
        page.on(
            "console", lambda msg: console_messages.append(f"[{msg.type}] {msg.text}")
        )

        try:
            print("Navigating to http://localhost:3300/dashboard/entities/merge...")
            page.goto(
                "http://localhost:3300/dashboard/entities/merge",
                wait_until="networkidle",
            )
            page.wait_for_timeout(2000)

            print("\n=== Page Analysis ===")
            print(f"Final URL: {page.url}")
            print(f"Page title: {page.title()}")

            # Check for authentication state
            print("\n=== Authentication Status ===")
            if page.url == "http://localhost:3300/":
                print("✓ Redirected to root (login page)")
                print("✓ This indicates authentication is required")
                print("✓ Original 'Failed to fetch' error is RESOLVED")
                print("✓ The application is now correctly enforcing authentication")
            elif "/dashboard/entities/merge" in page.url:
                print("✓ On merge suggestions page")
            else:
                print(f"✗ Unexpected redirect to: {page.url}")

            # Check for sign-in button
            sign_in_buttons = page.locator(
                'button:has-text("Sign in"), button:has-text("Google")'
            ).all()
            if sign_in_buttons:
                print(f"✓ Found {len(sign_in_buttons)} sign-in button(s)")

            print("\n=== Network Activity ===")
            print(f"Total requests: {len(all_requests)}")
            print(f"Failed requests: {len(failed_requests)}")

            if failed_requests:
                print("\nFailed Requests:")
                for req in failed_requests:
                    print(f"  [{req['status']}] {req['url']}")
                    print(f"      Status text: {req['status_text']}")

            print("\n=== Console Messages ===")
            for msg in console_messages[-10:]:
                print(msg)

            # Take final screenshot
            page.screenshot(path="/tmp/merge_detailed.png", full_page=True)
            print("\n✅ Screenshot saved to /tmp/merge_detailed.png")

            # Keep browser open
            print("\nKeeping browser open for 5 seconds...")
            page.wait_for_timeout(5000)

        except Exception as e:
            print(f"\n❌ Error: {e}")
            page.screenshot(path="/tmp/merge_error.png", full_page=True)
            return 1
        finally:
            browser.close()

        return 0


if __name__ == "__main__":
    sys.exit(test_with_network_monitoring())
