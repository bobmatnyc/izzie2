#!/bin/bash
#
# Simple script to add handleApiError import to all route files using requireAuth
# This is a safer, simpler approach than complex regex replacements
#

API_DIR="src/app/api"

echo "🔧 Adding handleApiError import to API route files..."
echo ""

# Find all route.ts files that import requireAuth but don't import handleApiError
FILES=$(grep -rl "requireAuth" "$API_DIR" --include="route.ts" | \
        xargs grep -L "handleApiError")

COUNT=0
for file in $FILES; do
  # Check if file imports from '@/lib/auth'
  if grep -q "from '@/lib/auth'" "$file"; then
    echo "📄 $file"

    # Add the import line after the requireAuth import
    # Using perl for in-place editing with backup
    perl -i.bak -pe 's{(import \{ requireAuth \} from '\''@/lib/auth'\'';)}{$1\nimport { handleApiError } from '\''@/lib/api/error-handler'\'';}'  "$file"

    # Remove backup file
    rm "${file}.bak"

    ((COUNT++))
  fi
done

echo ""
echo "✅ Added handleApiError import to $COUNT files"
echo ""
echo "⚠️  Note: You still need to manually update catch blocks to use handleApiError()"
echo "   Example:"
echo "   } catch (error) {"
echo "     return handleApiError(error, LOG_PREFIX, 'Operation failed');"
echo "   }"
