import { Pool } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });

async function checkMigrations() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('🔍 Checking applied migrations...\n');

    // Check drizzle migrations table
    const migrations = await pool.query(`
      SELECT * FROM drizzle.__drizzle_migrations
      ORDER BY created_at DESC
      LIMIT 15
    `);

    console.log('📋 Recent migrations:');
    migrations.rows.forEach((m: any) => {
      console.log(`  ${m.id} | ${m.created_at} | Hash: ${m.hash.substring(0, 12)}...`);
    });

    // Check all tables
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log(`\n📊 All tables in database (${tables.rows.length} total):`);
    tables.rows.forEach((t: any) => {
      const marker = t.table_name === 'file_attachments' ? ' ✅' : '';
      console.log(`  - ${t.table_name}${marker}`);
    });

  } catch (err: any) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

checkMigrations();
