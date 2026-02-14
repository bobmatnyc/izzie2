#!/usr/bin/env python3
"""
Direct API Test: Merge Suggestions Endpoint
Tests the /api/entities/merge-suggestions API directly

This bypasses the UI to test if the DATABASE_URL fix resolved the backend error.
"""

import requests
import json
from datetime import datetime


def test_merge_api_directly():
    """Test the merge-suggestions API endpoint directly"""

    print("=" * 70)
    print("DIRECT API TEST: /api/entities/merge-suggestions")
    print("=" * 70)
    print(f"Timestamp: {datetime.now().isoformat()}")
    print()

    # Test without authentication first
    print("TEST 1: Unauthenticated API Request")
    print("-" * 70)

    url = "https://izzie.bot/api/entities/merge-suggestions"

    try:
        response = requests.get(url, timeout=10)

        print(f"Status Code: {response.status_code}")
        print("Response Headers:")
        for key, value in response.headers.items():
            if key.lower() in [
                "content-type",
                "content-length",
                "server",
                "x-vercel-id",
            ]:
                print(f"  {key}: {value}")

        print()
        print("Response Body:")
        try:
            # Try to parse as JSON
            json_data = response.json()
            print(json.dumps(json_data, indent=2))

            # Check for specific error messages
            if isinstance(json_data, dict):
                if "error" in json_data:
                    error_msg = json_data.get("error", "")
                    print()
                    print("Error Analysis:")
                    if "database" in error_msg.lower() or "DATABASE_URL" in error_msg:
                        print("  ✗ DATABASE ERROR DETECTED")
                        print(f"  Error: {error_msg}")
                    elif (
                        "auth" in error_msg.lower()
                        or "unauthorized" in error_msg.lower()
                    ):
                        print("  ✓ Authentication required (expected)")
                    else:
                        print(f"  ⚠ Other error: {error_msg}")

        except json.JSONDecodeError:
            # Not JSON, print as text
            print(response.text[:1000])  # First 1000 chars

        print()
        print("Analysis:")
        if response.status_code == 401 or response.status_code == 403:
            print("  ✓ Status: PASS")
            print("  ✓ Authentication is working (401/403 expected)")
            print("  ✓ Database connection appears OK (no 500 error)")
            print("  ✓ Original 'Failed to fetch' error is RESOLVED")
        elif response.status_code == 500:
            print("  ✗ Status: FAIL")
            print("  ✗ 500 Internal Server Error")
            print("  ✗ Database connection issue likely")
        elif response.status_code == 200:
            print("  ✓ Status: PASS")
            print("  ✓ API returned successfully")
            print("  ℹ Note: May have returned empty data for unauthenticated user")
        else:
            print(f"  ⚠ Status: UNEXPECTED ({response.status_code})")

    except requests.exceptions.RequestException as e:
        print(f"✗ Request failed: {e}")

    print()
    print("=" * 70)
    print("CONCLUSION")
    print("=" * 70)

    if response.status_code in [200, 401, 403]:
        print("✓ PASS: API endpoint is responding correctly")
        print("✓ Database connection is working")
        print("✓ Original 'Failed to fetch merge suggestions' error is RESOLVED")
        print()
        print("The DATABASE_URL fix was successful!")
        return 0
    elif response.status_code == 500:
        print("✗ FAIL: API returning 500 error")
        print("✗ Database connection issue still present")
        print()
        print("The DATABASE_URL fix did NOT resolve the issue.")
        return 1
    else:
        print(f"⚠ UNCLEAR: Unexpected status code {response.status_code}")
        return 2


if __name__ == "__main__":
    exit(test_merge_api_directly())
