#!/usr/bin/env python3
"""
Test the merge suggestions feature in the browser.

Usage:
    python test_merge_suggestions.py

Navigates to http://localhost:3300/dashboard/entities/merge and:
1. Takes screenshots of the initial state
2. Checks for error messages
3. Tests the Refresh button functionality
4. Documents the current error state
"""

from playwright.sync_api import sync_playwright
import sys
import time


def test_merge_suggestions():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        # Enable console logging
        console_messages = []
        page.on(
            "console", lambda msg: console_messages.append(f"[{msg.type}] {msg.text}")
        )

        # Enable error tracking
        page_errors = []
        page.on("pageerror", lambda err: page_errors.append(str(err)))

        try:
            print("Navigating to http://localhost:3300/dashboard/entities/merge...")
            page.goto(
                "http://localhost:3300/dashboard/entities/merge",
                wait_until="networkidle",
            )

            # Wait a moment for any client-side rendering
            page.wait_for_timeout(2000)

            # Take initial screenshot
            print("Taking initial screenshot...")
            page.screenshot(path="/tmp/merge_suggestions_initial.png", full_page=True)

            # Check for error messages in the DOM
            print("\nChecking for error messages...")
            error_elements = page.locator("text=/error|failed|could not/i").all()

            if error_elements:
                print(f"Found {len(error_elements)} error-related elements:")
                for i, elem in enumerate(error_elements[:5]):  # Show first 5
                    try:
                        text = elem.text_content()
                        print(f"  {i+1}. {text[:100]}...")
                    except Exception:
                        pass
            else:
                print("No error messages found in DOM")

            # Check for authentication redirect
            current_url = page.url
            print(f"\nCurrent URL: {current_url}")
            if "login" in current_url.lower() or "auth" in current_url.lower():
                print("⚠️  Redirected to authentication page")
                page.screenshot(path="/tmp/merge_suggestions_auth.png", full_page=True)

            # Look for the Refresh button
            print("\nLooking for Refresh button...")
            refresh_buttons = page.locator(
                'button:has-text("Refresh"), button:has-text("Retry")'
            ).all()

            if refresh_buttons:
                print(f"Found {len(refresh_buttons)} refresh/retry button(s)")
                print("Testing Refresh button...")

                # Take screenshot before clicking
                page.screenshot(
                    path="/tmp/merge_suggestions_before_refresh.png", full_page=True
                )

                # Click the first refresh button
                refresh_buttons[0].click()

                # Wait for network activity to settle
                page.wait_for_timeout(2000)
                page.wait_for_load_state("networkidle")

                # Take screenshot after clicking
                print("Taking screenshot after refresh...")
                page.screenshot(
                    path="/tmp/merge_suggestions_after_refresh.png", full_page=True
                )

                # Check for new error messages
                error_elements_after = page.locator(
                    "text=/error|failed|could not/i"
                ).all()
                if error_elements_after:
                    print(
                        f"\nAfter refresh: Found {len(error_elements_after)} error-related elements:"
                    )
                    for i, elem in enumerate(error_elements_after[:5]):
                        try:
                            text = elem.text_content()
                            print(f"  {i+1}. {text[:100]}...")
                        except Exception:
                            pass
            else:
                print("No Refresh button found")

            # Print console messages
            print("\n=== Browser Console Messages ===")
            if console_messages:
                for msg in console_messages[-20:]:  # Show last 20 messages
                    print(msg)
            else:
                print("No console messages captured")

            # Print page errors
            print("\n=== JavaScript Errors ===")
            if page_errors:
                for err in page_errors:
                    print(f"ERROR: {err}")
            else:
                print("No JavaScript errors captured")

            # Get network requests
            print("\n=== Checking for Failed Network Requests ===")
            # Note: We'd need to set up request/response listeners before navigation
            # For now, we'll check the network tab via console

            print("\n✅ Test complete! Screenshots saved to /tmp/")
            print("\nScreenshots created:")
            print("  - /tmp/merge_suggestions_initial.png")
            if refresh_buttons:
                print("  - /tmp/merge_suggestions_before_refresh.png")
                print("  - /tmp/merge_suggestions_after_refresh.png")
            if "login" in current_url.lower() or "auth" in current_url.lower():
                print("  - /tmp/merge_suggestions_auth.png")

            # Keep browser open for manual inspection
            print("\nBrowser will stay open for 10 seconds for manual inspection...")
            time.sleep(10)

        except Exception as e:
            print(f"\n❌ Error during test: {e}")
            page.screenshot(path="/tmp/merge_suggestions_error.png", full_page=True)
            return 1
        finally:
            browser.close()

        return 0


if __name__ == "__main__":
    sys.exit(test_merge_suggestions())
