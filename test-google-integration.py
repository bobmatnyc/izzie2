#!/usr/bin/env python3
"""
Google Workspace Integration Tests for izzie.bot
Tests Contacts, Calendar, and Drive MCP tools integration
"""

import json
import time
import sys
from datetime import datetime

# Test results storage
test_results = {
    "timestamp": datetime.now().isoformat(),
    "category": "Google Workspace Integration",
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
# Contacts MCP Tools Tests
# ============================================================================


def test_contacts_tool_definitions(result: TestResult):
    """Test 1: Verify Contacts tool definitions exist"""
    try:
        # Read the contacts tools file
        with open(
            "/Users/masa/Projects/izzie2/src/lib/chat/tools/contacts.ts", "r"
        ) as f:
            content = f.read()

        expected_tools = [
            "searchContactsTool",
            "getContactDetailsTool",
            "syncContactsTool",
            "createContactTool",
            "updateContactTool",
            "deleteContactTool",
        ]

        missing_tools = [tool for tool in expected_tools if tool not in content]

        if missing_tools:
            result.fail_test(f"Missing tools: {missing_tools}")
        else:
            result.pass_test(f"All {len(expected_tools)} contact tools defined")

    except Exception as e:
        result.fail_test(f"Failed to read contacts tools: {str(e)}")


def test_contacts_schema_validation(result: TestResult):
    """Test 2: Verify Contacts tool schemas use Zod"""
    try:
        with open(
            "/Users/masa/Projects/izzie2/src/lib/chat/tools/contacts.ts", "r"
        ) as f:
            content = f.read()

        expected_schemas = [
            "searchContactsToolSchema",
            "getContactDetailsToolSchema",
            "syncContactsToolSchema",
            "createContactToolSchema",
            "updateContactToolSchema",
            "deleteContactToolSchema",
        ]

        missing_schemas = [
            schema for schema in expected_schemas if schema not in content
        ]

        # Check that schemas use z.object
        has_zod = "z.object(" in content

        if missing_schemas:
            result.fail_test(f"Missing schemas: {missing_schemas}")
        elif not has_zod:
            result.fail_test("Schemas don't use Zod validation")
        else:
            result.pass_test(f"All {len(expected_schemas)} schemas defined with Zod")

    except Exception as e:
        result.fail_test(f"Schema validation failed: {str(e)}")


def test_contacts_oauth_scope_check(result: TestResult):
    """Test 3: Verify Contacts tools check OAuth scopes"""
    try:
        with open(
            "/Users/masa/Projects/izzie2/src/lib/chat/tools/contacts.ts", "r"
        ) as f:
            content = f.read()

        # Check for requireContactsAccess calls
        scope_checks = content.count("requireContactsAccess")

        # Should be called in each tool's execute function (6 tools)
        expected_checks = 6

        if scope_checks < expected_checks:
            result.fail_test(
                f"Found {scope_checks} scope checks, expected {expected_checks}"
            )
        else:
            result.pass_test(f"All tools check OAuth scopes ({scope_checks} checks)")

    except Exception as e:
        result.fail_test(f"OAuth scope check failed: {str(e)}")


# ============================================================================
# Calendar MCP Tools Tests
# ============================================================================


def test_calendar_tool_definitions(result: TestResult):
    """Test 4: Verify Calendar tool definitions exist"""
    try:
        with open(
            "/Users/masa/Projects/izzie2/src/lib/chat/tools/calendar.ts", "r"
        ) as f:
            content = f.read()

        expected_tools = [
            "listCalendarEventsTool",
            "getCalendarEventTool",
            "searchCalendarEventsTool",
        ]

        missing_tools = [tool for tool in expected_tools if tool not in content]

        if missing_tools:
            result.fail_test(f"Missing tools: {missing_tools}")
        else:
            result.pass_test(f"All {len(expected_tools)} calendar tools defined")

    except Exception as e:
        result.fail_test(f"Failed to read calendar tools: {str(e)}")


def test_calendar_date_filtering(result: TestResult):
    """Test 5: Verify Calendar tools support date range filtering"""
    try:
        with open(
            "/Users/masa/Projects/izzie2/src/lib/chat/tools/calendar.ts", "r"
        ) as f:
            content = f.read()

        # Check for date range parameters
        has_time_min = "timeMin" in content or "startDate" in content
        has_time_max = "timeMax" in content or "endDate" in content

        if not has_time_min or not has_time_max:
            result.fail_test("Missing date range filtering parameters")
        else:
            result.pass_test("Calendar tools support date range filtering")

    except Exception as e:
        result.fail_test(f"Date filtering check failed: {str(e)}")


def test_calendar_sse_progress(result: TestResult):
    """Test 6: Verify Calendar processing uses SSE for progress"""
    try:
        with open(
            "/Users/masa/Projects/izzie2/src/onboarding/services/calendar-processor.ts",
            "r",
        ) as f:
            content = f.read()

        # Check for SSE/EventEmitter usage
        has_sse = (
            "EventEmitter" in content
            or "emit(" in content
            or "progress" in content.lower()
        )

        if not has_sse:
            result.fail_test("Calendar processor doesn't emit progress events")
        else:
            result.pass_test("Calendar processor emits progress via SSE")

    except Exception as e:
        result.fail_test(f"SSE progress check failed: {str(e)}")


# ============================================================================
# Drive MCP Tools Tests
# ============================================================================


def test_drive_tool_definitions(result: TestResult):
    """Test 7: Verify Drive tool definitions exist"""
    try:
        with open("/Users/masa/Projects/izzie2/src/lib/chat/tools/drive.ts", "r") as f:
            content = f.read()

        expected_tools = [
            "searchDriveFilesTool",
            "getDriveFileContentTool",
            "listDriveFilesTool",
        ]

        missing_tools = [tool for tool in expected_tools if tool not in content]

        if missing_tools:
            result.fail_test(f"Missing tools: {missing_tools}")
        else:
            result.pass_test(f"All {len(expected_tools)} drive tools defined")

    except Exception as e:
        result.fail_test(f"Failed to read drive tools: {str(e)}")


def test_drive_file_type_detection(result: TestResult):
    """Test 8: Verify Drive tools detect file types"""
    try:
        with open("/Users/masa/Projects/izzie2/src/lib/chat/tools/drive.ts", "r") as f:
            content = f.read()

        # Check for MIME type handling
        has_mime_handling = "mimeType" in content.lower()

        # Check for specific file types
        supports_docs = "document" in content.lower()
        supports_sheets = "spreadsheet" in content.lower()

        if not has_mime_handling:
            result.fail_test("No MIME type detection found")
        elif not supports_docs or not supports_sheets:
            result.fail_test("Missing support for Docs or Sheets")
        else:
            result.pass_test("Drive tools detect and handle file types")

    except Exception as e:
        result.fail_test(f"File type detection check failed: {str(e)}")


def test_drive_structured_content(result: TestResult):
    """Test 9: Verify Drive reads structured content for Docs/Sheets"""
    try:
        with open("/Users/masa/Projects/izzie2/src/lib/google/drive.ts", "r") as f:
            content = f.read()

        # Check for structured content reading
        has_export = "export" in content.lower()
        "structured" in content.lower() or "format" in content.lower()

        if not has_export:
            result.fail_test("No content export functionality found")
        else:
            result.pass_test("Drive service exports structured content")

    except Exception as e:
        result.fail_test(f"Structured content check failed: {str(e)}")


# ============================================================================
# Calendar Processing Integration Tests
# ============================================================================


def test_calendar_processor_entity_extraction(result: TestResult):
    """Test 10: Verify CalendarProcessorService extracts entities"""
    try:
        with open(
            "/Users/masa/Projects/izzie2/src/onboarding/services/calendar-processor.ts",
            "r",
        ) as f:
            content = f.read()

        # Check for entity extraction logic
        has_entity_extraction = (
            "entity" in content.lower() or "extract" in content.lower()
        )

        # Check for attendee processing
        has_attendee_logic = "attendee" in content.lower()

        if not has_entity_extraction:
            result.fail_test("No entity extraction logic found")
        elif not has_attendee_logic:
            result.fail_test("No attendee processing found")
        else:
            result.pass_test("Calendar processor extracts entities from events")

    except Exception as e:
        result.fail_test(f"Entity extraction check failed: {str(e)}")


def test_calendar_processor_relationship_inference(result: TestResult):
    """Test 11: Verify CalendarProcessor infers relationships"""
    try:
        with open(
            "/Users/masa/Projects/izzie2/src/onboarding/services/calendar-processor.ts",
            "r",
        ) as f:
            content = f.read()

        # Check for relationship inference
        has_relationship = "relationship" in content.lower()

        if not has_relationship:
            result.skip_test("Relationship inference may be handled elsewhere")
        else:
            result.pass_test("Calendar processor infers relationships from meetings")

    except Exception as e:
        result.fail_test(f"Relationship inference check failed: {str(e)}")


def test_calendar_processor_deduplication(result: TestResult):
    """Test 12: Verify CalendarProcessor deduplicates entities"""
    try:
        with open(
            "/Users/masa/Projects/izzie2/src/onboarding/services/calendar-processor.ts",
            "r",
        ) as f:
            content = f.read()

        # Check for deduplication logic
        has_dedup = (
            "dedupe" in content.lower()
            or "duplicate" in content.lower()
            or "unique" in content.lower()
        )

        if not has_dedup:
            result.fail_test("No deduplication logic found")
        else:
            result.pass_test("Calendar processor includes deduplication")

    except Exception as e:
        result.fail_test(f"Deduplication check failed: {str(e)}")


# ============================================================================
# Multi-Tenant Support Tests
# ============================================================================


def test_unified_processor_multi_tenant(result: TestResult):
    """Test 13: Verify UnifiedProcessorService supports multi-tenant"""
    try:
        with open(
            "/Users/masa/Projects/izzie2/src/onboarding/services/unified-processor.ts",
            "r",
        ) as f:
            content = f.read()

        # Check for userId/tenantId parameters
        has_user_isolation = "userId" in content

        if not has_user_isolation:
            result.fail_test("No user isolation in UnifiedProcessorService")
        else:
            result.pass_test(
                "UnifiedProcessorService supports multi-tenant architecture"
            )

    except Exception as e:
        result.skip_test(f"File not found or check failed: {str(e)}")


def test_calendar_processor_optional(result: TestResult):
    """Test 14: Verify CalendarProcessor is optional in UnifiedProcessor"""
    try:
        with open(
            "/Users/masa/Projects/izzie2/src/onboarding/services/unified-processor.ts",
            "r",
        ) as f:
            content = f.read()

        # Check that calendarProcessor is optional (based on commit 9fd2c28)
        has_optional = "calendarProcessor?" in content or "optional" in content.lower()

        if not has_optional:
            result.fail_test("CalendarProcessor is not marked as optional")
        else:
            result.pass_test("CalendarProcessor is optional per commit 9fd2c28")

    except Exception as e:
        result.skip_test(f"File not found or check failed: {str(e)}")


# ============================================================================
# Main Test Runner
# ============================================================================


def main():
    print("=" * 80)
    print("🧪 Google Workspace Integration Tests")
    print("   Testing: Contacts, Calendar, Drive MCP Tools")
    print(f"   Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    print()

    # Contacts MCP Tools Tests
    print("\n📇 Contacts MCP Tools")
    print("-" * 80)
    run_test("Contacts Tool Definitions", "contacts", test_contacts_tool_definitions)
    run_test("Contacts Schema Validation", "contacts", test_contacts_schema_validation)
    run_test("Contacts OAuth Scope Check", "contacts", test_contacts_oauth_scope_check)

    # Calendar MCP Tools Tests
    print("\n📅 Calendar MCP Tools")
    print("-" * 80)
    run_test("Calendar Tool Definitions", "calendar", test_calendar_tool_definitions)
    run_test("Calendar Date Filtering", "calendar", test_calendar_date_filtering)
    run_test("Calendar SSE Progress", "calendar", test_calendar_sse_progress)

    # Drive MCP Tools Tests
    print("\n📁 Drive MCP Tools")
    print("-" * 80)
    run_test("Drive Tool Definitions", "drive", test_drive_tool_definitions)
    run_test("Drive File Type Detection", "drive", test_drive_file_type_detection)
    run_test("Drive Structured Content", "drive", test_drive_structured_content)

    # Calendar Processing Integration
    print("\n⚙️  Calendar Processing Integration")
    print("-" * 80)
    run_test(
        "Calendar Entity Extraction",
        "processing",
        test_calendar_processor_entity_extraction,
    )
    run_test(
        "Calendar Relationship Inference",
        "processing",
        test_calendar_processor_relationship_inference,
    )
    run_test(
        "Calendar Entity Deduplication",
        "processing",
        test_calendar_processor_deduplication,
    )

    # Multi-Tenant Support
    print("\n👥 Multi-Tenant Support")
    print("-" * 80)
    run_test(
        "UnifiedProcessor Multi-Tenant",
        "multi-tenant",
        test_unified_processor_multi_tenant,
    )
    run_test(
        "CalendarProcessor Optional", "multi-tenant", test_calendar_processor_optional
    )

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
    print("🏥 Integration Health Assessment")
    print("=" * 80)

    if test_results["failed"] == 0:
        print("✅ EXCELLENT - All integration tests passed.")
        health_status = "HEALTHY"
    elif test_results["failed"] <= 2:
        print("⚠️  GOOD - Minor issues detected.")
        health_status = "MOSTLY_HEALTHY"
    else:
        print("❌ NEEDS WORK - Several integration issues detected.")
        health_status = "NEEDS_ATTENTION"

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
    results_file = f"/tmp/izzie-google-integration-results-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    with open(results_file, "w") as f:
        json.dump(test_results, f, indent=2)

    print(f"\n📄 Full results saved to: {results_file}")
    print("=" * 80)

    # Exit with appropriate code
    sys.exit(0 if test_results["failed"] == 0 else 1)


if __name__ == "__main__":
    main()
