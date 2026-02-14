import { Pool } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.production.local' });

async function applyMigration() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('🔍 Checking if file_attachments table exists...\n');

    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'file_attachments'
    `);

    if (tableCheck.rows.length > 0) {
      console.log('✅ Table file_attachments already exists. Skipping migration.');
      return;
    }

    console.log('📄 Reading migration SQL...');
    const migrationSQL = fs.readFileSync(
      'drizzle/migrations/0034_add_file_attachments.sql',
      'utf-8'
    );

    console.log('🚀 Applying migration 0034_add_file_attachments...\n');

    // Execute the migration
    await pool.query(migrationSQL);

    console.log('✅ Migration applied successfully!\n');

    // Verify table was created
    const verifyCheck = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'file_attachments'
    `);

    if (verifyCheck.rows.length > 0) {
      console.log('✅ Verified: file_attachments table now exists');

      // Show columns
      const columns = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'file_attachments'
        ORDER BY ordinal_position
      `);

      console.log(`\n📋 Table has ${columns.rows.length} columns:`);
      columns.rows.forEach((col: any) => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
    } else {
      console.error('❌ Table was not created!');
      process.exit(1);
    }

  } catch (err: any) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyMigration();
