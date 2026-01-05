/**
 * Database Migration Runner
 *
 * Runs pending migrations against Neon Postgres database.
 * Usage: npm run db:migrate
 */

import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { Pool } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL not found in environment variables');
    console.error('Please set DATABASE_URL in your .env file');
    process.exit(1);
  }

  console.log('🔌 Connecting to database...');

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  try {
    console.log('🚀 Running migrations...');

    await migrate(db, {
      migrationsFolder: join(__dirname, 'migrations'),
    });

    console.log('✅ Migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('👋 Database connection closed');
  }
}

// Run migrations
runMigrations();
