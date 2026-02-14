#!/usr/bin/env python3
"""
Production E2E Test: Merge Suggestions Feature
Tests: https://izzie.bot/dashboard/entities/merge

Verifies:
1. Page loads correctly (with or without auth)
2. No "Failed to fetch merge suggestions" error
3. API endpoint /api/entities/merge-suggestions responds correctly
4. Database connection is working
"""

import sys
from playwright.sync_api import sync_playwright
import json
from datetime import datetime


def test_merge_suggestions_production():
    """Test merge suggestions feature on production"""

    results = {
        "timestamp": datetime.now().isoformat(),
        "url": "https://izzie.bot/dashboard/entities/merge",
        "tests": {},
        "overall_status": "UNKNOWN",
    }

    with sync_playwright() as p:
        # Launch browser in non-headless mode to see what's happening
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        )
        page = context.new_page()

        # Capture console logs
        console_logs = []
        page.on(
            "console",
            lambda msg: console_logs.append(
                {"type": msg.type, "text": msg.text, "location": msg.location}
            ),
        )

        # Capture network requests
        network_requests = []
        page.on(
            "request",
            lambda request: network_requests.append(
                {
                    "method": request.method,
                    "url": request.url,
                    "resource_type": request.resource_type,
                }
            ),
        )

        # Capture network responses
        network_responses = []
        page.on(
            "response",
            lambda response: network_responses.append(
                {"status": response.status, "url": response.url, "ok": response.ok}
            ),
        )

        try:
            print("\n=== TEST 1: Navigate to Merge Suggestions Page ===")
            response = page.goto(
                "https://izzie.bot/dashboard/entities/merge",
                wait_until="networkidle",
                timeout=30000,
            )

            results["tests"]["navigation"] = {
                "status": "PASS" if response.ok else "FAIL",
                "response_status": response.status,
                "url": response.url,
            }

            print(f"✓ Initial response status: {response.status}")
            print(f"✓ Final URL: {response.url}")

            # Take initial screenshot
            screenshot_path = "/tmp/merge-suggestions-initial.png"
            page.screenshot(path=screenshot_path, full_page=True)
            print(f"✓ Screenshot saved: {screenshot_path}")

            # Wait a bit for any JavaScript to execute
            page.wait_for_timeout(2000)

            print("\n=== TEST 2: Check Page State ===")

            # Check if we're on login page
            current_url = page.url
            is_login_page = "/login" in current_url or "/auth" in current_url

            if is_login_page:
                results["tests"]["authentication"] = {
                    "status": "INFO",
                    "message": "Redirected to login - authentication required",
                    "redirect_url": current_url,
                }
                print(f"ℹ Redirected to login: {current_url}")
                print("✓ Authentication flow is working")

                # Take login page screenshot
                login_screenshot = "/tmp/merge-suggestions-login.png"
                page.screenshot(path=login_screenshot, full_page=True)
                print(f"✓ Login page screenshot: {login_screenshot}")

            else:
                results["tests"]["authentication"] = {
                    "status": "PASS",
                    "message": "No authentication required or already authenticated",
                }
                print("✓ No authentication redirect")

                # Check page content
                page_title = page.title()
                page_content = page.content()

                print(f"✓ Page title: {page_title}")

                # Look for error messages
                error_indicators = [
                    "Failed to fetch merge suggestions",
                    "500 Internal Server Error",
                    "DATABASE_URL",
                    "Connection error",
                    "Database error",
                ]

                found_errors = [err for err in error_indicators if err in page_content]

                if found_errors:
                    results["tests"]["error_check"] = {
                        "status": "FAIL",
                        "errors_found": found_errors,
                    }
                    print(f"✗ Found errors on page: {found_errors}")
                else:
                    results["tests"]["error_check"] = {
                        "status": "PASS",
                        "message": "No error indicators found",
                    }
                    print("✓ No error indicators found on page")

                # Try to find refresh button
                try:
                    refresh_button = page.locator('button:has-text("Refresh")')
                    if refresh_button.count() > 0:
                        print("✓ Found Refresh button")

                        # Click refresh and observe
                        print("\n=== TEST 3: Test Refresh Button ===")
                        refresh_button.click()
                        page.wait_for_timeout(2000)

                        # Take screenshot after refresh
                        refresh_screenshot = "/tmp/merge-suggestions-after-refresh.png"
                        page.screenshot(path=refresh_screenshot, full_page=True)
                        print(f"✓ Post-refresh screenshot: {refresh_screenshot}")

                        results["tests"]["refresh_button"] = {
                            "status": "PASS",
                            "message": "Refresh button clicked successfully",
                        }
                except Exception as e:
                    results["tests"]["refresh_button"] = {
                        "status": "INFO",
                        "message": f"Refresh button not found or not clickable: {str(e)}",
                    }
                    print(f"ℹ Refresh button not found or not clickable: {e}")

            print("\n=== TEST 4: Analyze Network Requests ===")

            # Find API requests to merge-suggestions
            api_requests = [
                req
                for req in network_responses
                if "/api/entities/merge-suggestions" in req["url"]
            ]

            if api_requests:
                for idx, req in enumerate(api_requests):
                    print(f"\nAPI Request #{idx + 1}:")
                    print(f"  Status: {req['status']}")
                    print(f"  URL: {req['url']}")
                    print(f"  Success: {req['ok']}")

                    results["tests"][f"api_request_{idx}"] = {
                        "status": "PASS" if req["ok"] else "FAIL",
                        "http_status": req["status"],
                        "url": req["url"],
                    }
            else:
                results["tests"]["api_requests"] = {
                    "status": "INFO",
                    "message": "No API requests to /api/entities/merge-suggestions detected",
                }
                print("ℹ No API requests to merge-suggestions endpoint detected")

            print("\n=== TEST 5: Console Errors ===")

            # Check for console errors
            console_errors = [log for log in console_logs if log["type"] == "error"]
            console_warnings = [log for log in console_logs if log["type"] == "warning"]

            if console_errors:
                print(f"✗ Found {len(console_errors)} console errors:")
                for error in console_errors[:5]:  # Show first 5
                    print(f"  - {error['text']}")

                results["tests"]["console_errors"] = {
                    "status": "FAIL",
                    "count": len(console_errors),
                    "errors": console_errors[:10],  # Store first 10
                }
            else:
                print("✓ No console errors")
                results["tests"]["console_errors"] = {"status": "PASS", "count": 0}

            if console_warnings:
                print(f"⚠ Found {len(console_warnings)} console warnings")
                results["tests"]["console_warnings"] = {
                    "status": "INFO",
                    "count": len(console_warnings),
                    "warnings": console_warnings[:5],
                }

            print("\n=== TEST 6: Check for Database Connection ===")

            # Look for database-related errors in network responses
            db_errors = [
                resp
                for resp in network_responses
                if not resp["ok"] and resp["status"] == 500
            ]

            if db_errors:
                print(f"✗ Found {len(db_errors)} 500 errors (potential DB issues)")
                results["tests"]["database_connection"] = {
                    "status": "FAIL",
                    "message": "Found 500 errors - potential database connection issue",
                    "error_count": len(db_errors),
                }
            else:
                print("✓ No 500 errors detected")
                results["tests"]["database_connection"] = {
                    "status": "PASS",
                    "message": "No 500 errors - database appears connected",
                }

        except Exception as e:
            results["tests"]["execution_error"] = {
                "status": "ERROR",
                "error": str(e),
                "type": type(e).__name__,
            }
            print(f"\n✗ Test execution error: {e}")

            # Take error screenshot
            try:
                error_screenshot = "/tmp/merge-suggestions-error.png"
                page.screenshot(path=error_screenshot, full_page=True)
                print(f"✓ Error screenshot: {error_screenshot}")
            except Exception:
                pass

        finally:
            # Keep browser open for manual inspection
            print("\n=== Browser kept open for manual inspection ===")
            print("Press Enter to close browser and complete test...")
            input()

            browser.close()

    # Determine overall status
    test_statuses = [test.get("status") for test in results["tests"].values()]
    if "FAIL" in test_statuses or "ERROR" in test_statuses:
        results["overall_status"] = "FAIL"
    elif all(status in ["PASS", "INFO"] for status in test_statuses):
        results["overall_status"] = "PASS"
    else:
        results["overall_status"] = "PARTIAL"

    return results


def print_summary(results):
    """Print test summary"""
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    print(f"Timestamp: {results['timestamp']}")
    print(f"URL: {results['url']}")
    print(f"Overall Status: {results['overall_status']}")
    print()

    print("Test Results:")
    for test_name, test_result in results["tests"].items():
        status = test_result.get("status", "UNKNOWN")
        status_icon = {"PASS": "✓", "FAIL": "✗", "INFO": "ℹ", "ERROR": "⚠"}.get(
            status, "?"
        )

        print(f"  {status_icon} {test_name}: {status}")
        if "message" in test_result:
            print(f"    {test_result['message']}")

    print()
    print("=" * 70)

    # Save results to file
    results_file = "/tmp/merge-suggestions-test-results.json"
    with open(results_file, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Full results saved to: {results_file}")
    print("=" * 70)


if __name__ == "__main__":
    print("Starting Production E2E Test: Merge Suggestions Feature")
    print("=" * 70)

    results = test_merge_suggestions_production()
    print_summary(results)

    # Exit with appropriate code
    if results["overall_status"] == "FAIL":
        sys.exit(1)
    else:
        sys.exit(0)
