/**
 * Verify file_attachments table structure after migration
 */
import { Pool } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });

async function verifyTable() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('🔍 Verifying file_attachments table...\n');

    // Check table exists
    const tableCheck = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'file_attachments'
    `);

    if (tableCheck.rows.length === 0) {
      console.error('❌ Table file_attachments does not exist!');
      process.exit(1);
    }

    console.log('✅ Table exists: file_attachments\n');

    // Get columns
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'file_attachments'
      ORDER BY ordinal_position
    `);

    console.log('📋 Columns:');
    columns.rows.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? 'nullable' : 'NOT NULL';
      const defaultVal = col.column_default ? ` (default: ${col.column_default})` : '';
      console.log(`  ✓ ${col.column_name.padEnd(25)} ${col.data_type.padEnd(20)} ${nullable}${defaultVal}`);
    });

    // Verify required columns exist
    const requiredColumns = [
      'id', 'user_id', 'direction', 'file_name', 'mime_type', 'file_size',
      'drive_file_id', 'telegram_file_id', 'telegram_chat_id', 'telegram_message_id',
      'chat_session_id', 'status', 'error_message', 'created_at', 'completed_at', 'metadata'
    ];

    const actualColumns = columns.rows.map(c => c.column_name);
    const missingColumns = requiredColumns.filter(col => !actualColumns.includes(col));

    if (missingColumns.length > 0) {
      console.error(`\n❌ Missing columns: ${missingColumns.join(', ')}`);
      process.exit(1);
    }

    console.log('\n✅ All required columns present');

    // Get indexes
    const indexes = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'file_attachments'
      ORDER BY indexname
    `);

    console.log('\n🔍 Indexes:');
    indexes.rows.forEach(idx => {
      console.log(`  ✓ ${idx.indexname}`);
    });

    // Verify required indexes exist
    const requiredIndexes = [
      'file_attachments_user_id_idx',
      'file_attachments_direction_idx',
      'file_attachments_status_idx',
      'file_attachments_chat_session_id_idx',
      'file_attachments_drive_file_id_idx',
      'file_attachments_telegram_file_id_idx',
      'file_attachments_created_at_idx',
    ];

    const actualIndexes = indexes.rows.map(i => i.indexname);
    const missingIndexes = requiredIndexes.filter(idx => !actualIndexes.includes(idx));

    if (missingIndexes.length > 0) {
      console.warn(`\n⚠️  Missing recommended indexes: ${missingIndexes.join(', ')}`);
    } else {
      console.log('\n✅ All required indexes present');
    }

    // Test insert (to verify constraints)
    console.log('\n🧪 Testing table constraints...');

    try {
      // This should fail due to foreign key constraint (no such user)
      await pool.query(`
        INSERT INTO file_attachments (user_id, direction, file_name, mime_type, file_size, status)
        VALUES ('test_nonexistent_user', 'inbound', 'test.pdf', 'application/pdf', 1024, 'pending')
      `);
      console.error('❌ Foreign key constraint not working (should have failed)');
    } catch (err: any) {
      if (err.message.includes('violates foreign key constraint')) {
        console.log('  ✓ Foreign key constraint working (user_id -> users)');
      } else {
        console.error('  ❌ Unexpected error:', err.message);
      }
    }

    console.log('\n✅ Migration verification complete!');

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifyTable();
