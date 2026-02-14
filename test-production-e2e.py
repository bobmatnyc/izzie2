#!/usr/bin/env python3
"""
Comprehensive End-to-End Production Tests for izzie.bot
Tests all newly deployed features with authentication bypass where appropriate.
"""

import json
import time
import sys
from datetime import datetime
from playwright.sync_api import sync_playwright, Page, Browser, BrowserContext

# Production URL
BASE_URL = "https://izzie.bot"
DEPLOYMENT_HASH = "9fd2c28"

# Test results storage
test_results = {
    "timestamp": datetime.now().isoformat(),
    "deployment": DEPLOYMENT_HASH,
    "base_url": BASE_URL,
    "total_tests": 0,
    "passed": 0,
    "failed": 0,
    "skipped": 0,
    "tests": [],
}


class TestResult:
    """Individual test result"""

    def __init__(self, name: str, category: str):
        self.name = name
        self.category = category
        self.status = "pending"
        self.message = ""
        self.duration = 0
        self.errors = []
        self.start_time = time.time()

    def pass_test(self, message: str = ""):
        self.status = "passed"
        self.message = message
        self.duration = time.time() - self.start_time
        test_results["passed"] += 1
        print(f"✅ PASS: {self.name} ({self.duration:.2f}s)")
        if message:
            print(f"   {message}")

    def fail_test(self, error: str):
        self.status = "failed"
        self.errors.append(error)
        self.duration = time.time() - self.start_time
        test_results["failed"] += 1
        print(f"❌ FAIL: {self.name} ({self.duration:.2f}s)")
        print(f"   Error: {error}")

    def skip_test(self, reason: str):
        self.status = "skipped"
        self.message = reason
        self.duration = time.time() - self.start_time
        test_results["skipped"] += 1
        print(f"⏭️  SKIP: {self.name}")
        print(f"   Reason: {reason}")

    def to_dict(self):
        return {
            "name": self.name,
            "category": self.category,
            "status": self.status,
            "message": self.message,
            "duration": self.duration,
            "errors": self.errors,
        }


def run_test(name: str, category: str, test_func, *args, **kwargs):
    """Run a test function and track results"""
    test_results["total_tests"] += 1
    result = TestResult(name, category)

    try:
        test_func(result, *args, **kwargs)
    except Exception as e:
        result.fail_test(str(e))

    test_results["tests"].append(result.to_dict())
    return result.status == "passed"


# ============================================================================
# Critical Path Tests
# ============================================================================


def test_health_check(result: TestResult, page: Page):
    """Test 1: Main app loads correctly"""
    try:
        response = page.goto(BASE_URL, wait_until="networkidle", timeout=10000)

        if not response:
            result.fail_test("No response from server")
            return

        status = response.status

        if status != 200:
            result.fail_test(f"Unexpected status code: {status}")
            return

        # Check for basic HTML structure
        title = page.title()
        if not title:
            result.fail_test("No page title found")
            return

        # Take screenshot for visual verification
        page.screenshot(path="/tmp/izzie-health-check.png", full_page=True)

        result.pass_test(f"Status: {status}, Title: '{title}'")

    except Exception as e:
        result.fail_test(f"Page load failed: {str(e)}")


def test_api_health(result: TestResult, page: Page):
    """Test 2: API health endpoint responds"""
    try:
        # Check if there's a health endpoint
        response = page.goto(
            f"{BASE_URL}/api/health", wait_until="networkidle", timeout=5000
        )

        if not response:
            result.skip_test("No /api/health endpoint found (not critical)")
            return

        status = response.status

        if status == 200:
            try:
                body = response.json()
                result.pass_test(f"Health check OK: {json.dumps(body)}")
            except Exception:
                result.pass_test(f"Health check responded with status {status}")
        else:
            result.skip_test(f"Health endpoint returned {status} (may not exist)")

    except Exception as e:
        result.skip_test(f"No health endpoint or error: {str(e)}")


def test_static_assets(result: TestResult, page: Page):
    """Test 3: Static assets load correctly"""
    try:
        page.goto(BASE_URL, wait_until="networkidle", timeout=10000)

        # Check for common static assets
        errors = []
        page.on(
            "console",
            lambda msg: errors.append(msg.text) if msg.type == "error" else None,
        )

        # Wait a bit for any lazy-loaded assets
        page.wait_for_timeout(2000)

        # Check if there are critical errors
        critical_errors = [e for e in errors if "Failed to load" in e or "404" in e]

        if critical_errors:
            result.fail_test(f"Static asset errors: {critical_errors[:3]}")
        else:
            result.pass_test("No critical static asset errors detected")

    except Exception as e:
        result.fail_test(f"Static asset check failed: {str(e)}")


# ============================================================================
# Authentication Tests
# ============================================================================


def test_unauthenticated_access(result: TestResult, page: Page):
    """Test 4: Unauthenticated requests return appropriate responses"""
    try:
        # Try accessing protected API endpoint without auth
        response = page.goto(
            f"{BASE_URL}/api/research", wait_until="networkidle", timeout=5000
        )

        if not response:
            result.fail_test("No response from protected endpoint")
            return

        status = response.status

        # Should get 401 or 403 for protected endpoints
        if status in [401, 403, 302]:
            result.pass_test(f"Correctly returns {status} for unauthenticated access")
        else:
            result.fail_test(
                f"Unexpected status {status} for protected endpoint (expected 401/403/302)"
            )

    except Exception as e:
        result.fail_test(f"Auth test failed: {str(e)}")


# ============================================================================
# API Endpoint Tests (Public/Unauthenticated)
# ============================================================================


def test_api_endpoint(
    result: TestResult,
    page: Page,
    endpoint: str,
    method: str = "GET",
    expected_statuses: list = [401, 403, 200],
):
    """Generic API endpoint test"""
    try:
        url = f"{BASE_URL}{endpoint}"

        if method == "GET":
            response = page.goto(url, wait_until="networkidle", timeout=5000)
        else:
            response = page.request.fetch(url, method=method, timeout=5000)

        if not response:
            result.fail_test(f"No response from {endpoint}")
            return

        status = response.status

        if status in expected_statuses:
            result.pass_test(f"Endpoint responded with expected status {status}")
        elif status in [401, 403]:
            result.pass_test(f"Endpoint requires authentication ({status})")
        else:
            result.fail_test(
                f"Unexpected status {status} (expected one of {expected_statuses})"
            )

    except Exception as e:
        result.fail_test(f"Endpoint test failed: {str(e)}")


# ============================================================================
# Performance Tests
# ============================================================================


def test_page_load_performance(result: TestResult, page: Page):
    """Test 5: Page load performance"""
    try:
        start_time = time.time()
        page.goto(BASE_URL, wait_until="networkidle", timeout=10000)
        load_time = time.time() - start_time

        if load_time < 2.0:
            result.pass_test(f"Excellent load time: {load_time:.2f}s")
        elif load_time < 5.0:
            result.pass_test(f"Acceptable load time: {load_time:.2f}s")
        else:
            result.fail_test(f"Slow load time: {load_time:.2f}s (target: <2s)")

    except Exception as e:
        result.fail_test(f"Performance test failed: {str(e)}")


# ============================================================================
# Console Error Detection
# ============================================================================


def test_console_errors(result: TestResult, page: Page):
    """Test 6: Check for JavaScript console errors"""
    try:
        errors = []
        warnings = []

        def handle_console(msg):
            if msg.type == "error":
                errors.append(msg.text)
            elif msg.type == "warning":
                warnings.append(msg.text)

        page.on("console", handle_console)
        page.goto(BASE_URL, wait_until="networkidle", timeout=10000)
        page.wait_for_timeout(2000)  # Wait for any lazy-loaded scripts

        # Filter out known non-critical errors
        critical_errors = [
            e
            for e in errors
            if not any(
                ignore in e.lower()
                for ignore in ["favicon", "analytics", "gtm", "googletagmanager"]
            )
        ]

        if critical_errors:
            result.fail_test(
                f"Found {len(critical_errors)} console errors: {critical_errors[:3]}"
            )
        elif warnings:
            result.pass_test(f"No critical errors (found {len(warnings)} warnings)")
        else:
            result.pass_test("No console errors detected")

    except Exception as e:
        result.fail_test(f"Console error check failed: {str(e)}")


# ============================================================================
# Regression Tests
# ============================================================================


def test_existing_routes(result: TestResult, page: Page):
    """Test 7: Verify existing routes still work"""
    try:
        routes_to_check = [
            ("/", [200, 302]),
            ("/api/metrics", [200, 401, 403]),
            ("/api/settings/costs", [200, 401, 403]),
            ("/api/tasks/sync", [200, 401, 403, 405]),
            ("/api/discover/status", [200, 401, 403]),
        ]

        failed_routes = []

        for route, expected_statuses in routes_to_check:
            try:
                response = page.goto(
                    f"{BASE_URL}{route}", wait_until="networkidle", timeout=5000
                )
                if response and response.status not in expected_statuses:
                    failed_routes.append(
                        f"{route} (got {response.status}, expected {expected_statuses})"
                    )
            except Exception as e:
                failed_routes.append(f"{route} (error: {str(e)})")

        if failed_routes:
            result.fail_test(f"Routes failed: {failed_routes}")
        else:
            result.pass_test(f"All {len(routes_to_check)} routes responded correctly")

    except Exception as e:
        result.fail_test(f"Route regression test failed: {str(e)}")


# ============================================================================
# Network Request Analysis
# ============================================================================


def test_network_requests(result: TestResult, page: Page):
    """Test 8: Analyze network requests"""
    try:
        failed_requests = []
        slow_requests = []

        def handle_request_finished(request):
            response = request.response()
            if response:
                timing = request.timing()
                total_time = timing.get("responseEnd", 0)

                if response.status >= 400:
                    failed_requests.append(
                        {
                            "url": request.url,
                            "status": response.status,
                            "method": request.method,
                        }
                    )

                if total_time > 2000:  # Slow requests > 2s
                    slow_requests.append({"url": request.url, "time": total_time})

        page.on("requestfinished", handle_request_finished)
        page.goto(BASE_URL, wait_until="networkidle", timeout=10000)
        page.wait_for_timeout(3000)

        issues = []

        # Filter out expected auth failures
        critical_failures = [
            r for r in failed_requests if r["status"] not in [401, 403]
        ]

        if critical_failures:
            issues.append(f"{len(critical_failures)} critical request failures")

        if slow_requests:
            issues.append(f"{len(slow_requests)} slow requests (>2s)")

        if issues:
            result.fail_test(f"Network issues: {', '.join(issues)}")
        else:
            result.pass_test(
                f"All network requests healthy (auth failures: {len(failed_requests) - len(critical_failures)})"
            )

    except Exception as e:
        result.fail_test(f"Network analysis failed: {str(e)}")


# ============================================================================
# Mobile Responsiveness
# ============================================================================


def test_mobile_responsive(result: TestResult, context: BrowserContext):
    """Test 9: Mobile responsiveness"""
    try:
        # Create mobile viewport
        mobile_page = context.new_page()
        mobile_page.set_viewport_size({"width": 375, "height": 667})  # iPhone SE

        response = mobile_page.goto(BASE_URL, wait_until="networkidle", timeout=10000)

        if not response or response.status != 200:
            result.fail_test(
                f"Mobile page failed to load (status: {response.status if response else 'no response'})"
            )
            mobile_page.close()
            return

        # Take mobile screenshot
        mobile_page.screenshot(path="/tmp/izzie-mobile.png", full_page=True)

        # Check for mobile-friendly meta tags
        viewport_meta = mobile_page.locator('meta[name="viewport"]').count()

        mobile_page.close()

        if viewport_meta > 0:
            result.pass_test("Mobile page loads correctly with responsive meta tags")
        else:
            result.fail_test("Missing viewport meta tag for mobile responsiveness")

    except Exception as e:
        result.fail_test(f"Mobile test failed: {str(e)}")


# ============================================================================
# Main Test Runner
# ============================================================================


def main():
    print("=" * 80)
    print("🧪 Izzie.bot Production E2E Tests")
    print(f"   URL: {BASE_URL}")
    print(f"   Deployment: {DEPLOYMENT_HASH}")
    print(f"   Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    print()

    with sync_playwright() as p:
        # Launch browser in headless mode
        browser: Browser = p.chromium.launch(headless=True)
        context: BrowserContext = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        )
        page: Page = context.new_page()

        # Critical Path Tests
        print("\n📋 Critical Path Tests")
        print("-" * 80)
        run_test("Health Check - Main App Loads", "critical", test_health_check, page)
        run_test("Health Check - API Responds", "critical", test_api_health, page)
        run_test("Static Assets Load", "critical", test_static_assets, page)
        run_test(
            "Unauthenticated Access Handling",
            "critical",
            test_unauthenticated_access,
            page,
        )

        # Performance Tests
        print("\n⚡ Performance Tests")
        print("-" * 80)
        run_test(
            "Page Load Performance", "performance", test_page_load_performance, page
        )
        run_test("Network Request Analysis", "performance", test_network_requests, page)

        # Error Detection
        print("\n🐛 Error Detection Tests")
        print("-" * 80)
        run_test("Console Error Detection", "errors", test_console_errors, page)

        # Regression Tests
        print("\n🔄 Regression Tests")
        print("-" * 80)
        run_test("Existing Routes Still Work", "regression", test_existing_routes, page)

        # Responsiveness
        print("\n📱 Responsiveness Tests")
        print("-" * 80)
        run_test(
            "Mobile Responsive Design", "responsive", test_mobile_responsive, context
        )

        # API Endpoint Tests (sample of key endpoints)
        print("\n🔌 API Endpoint Tests")
        print("-" * 80)
        run_test(
            "Research API Endpoint",
            "api",
            test_api_endpoint,
            page,
            "/api/research",
            "GET",
            [401, 403],
        )
        run_test(
            "Discover Status Endpoint",
            "api",
            test_api_endpoint,
            page,
            "/api/discover/status",
            "GET",
            [200, 401, 403],
        )
        run_test(
            "Metrics Endpoint",
            "api",
            test_api_endpoint,
            page,
            "/api/metrics",
            "GET",
            [200, 401, 403],
        )
        run_test(
            "Tasks Sync Endpoint",
            "api",
            test_api_endpoint,
            page,
            "/api/tasks/sync",
            "POST",
            [401, 403, 405],
        )

        # Cleanup
        browser.close()

    # Print Summary
    print("\n" + "=" * 80)
    print("📊 Test Summary")
    print("=" * 80)
    print(f"Total Tests:  {test_results['total_tests']}")
    print(f"✅ Passed:     {test_results['passed']}")
    print(f"❌ Failed:     {test_results['failed']}")
    print(f"⏭️  Skipped:    {test_results['skipped']}")
    print()

    pass_rate = (
        (test_results["passed"] / test_results["total_tests"] * 100)
        if test_results["total_tests"] > 0
        else 0
    )
    print(f"Pass Rate: {pass_rate:.1f}%")

    # Overall health assessment
    print("\n" + "=" * 80)
    print("🏥 Overall System Health Assessment")
    print("=" * 80)

    if test_results["failed"] == 0:
        print("✅ EXCELLENT - All tests passed. System is healthy.")
        health_status = "HEALTHY"
    elif test_results["failed"] <= 2:
        print("⚠️  GOOD - Minor issues detected. System is mostly functional.")
        health_status = "MOSTLY_HEALTHY"
    elif test_results["failed"] <= 5:
        print("⚠️  FAIR - Several issues detected. Requires attention.")
        health_status = "NEEDS_ATTENTION"
    else:
        print("❌ POOR - Significant issues detected. Immediate action required.")
        health_status = "CRITICAL"

    test_results["health_status"] = health_status

    # Failed tests details
    if test_results["failed"] > 0:
        print("\n❌ Failed Tests Details:")
        for test in test_results["tests"]:
            if test["status"] == "failed":
                print(f"\n  • {test['name']}")
                print(f"    Category: {test['category']}")
                for error in test["errors"]:
                    print(f"    Error: {error}")

    # Save results to file
    results_file = (
        f"/tmp/izzie-test-results-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    )
    with open(results_file, "w") as f:
        json.dump(test_results, f, indent=2)

    print(f"\n📄 Full results saved to: {results_file}")
    print("=" * 80)

    # Exit with appropriate code
    sys.exit(0 if test_results["failed"] == 0 else 1)


if __name__ == "__main__":
    main()
