import { dbClient } from '../src/lib/db';
import { sql } from 'drizzle-orm';

async function checkTable() {
  try {
    const db = dbClient.getDb();
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'chat_sessions'
      );
    `);

    console.log('chat_sessions table exists:', result.rows[0].exists);

    if (result.rows[0].exists) {
      const count = await db.execute(sql`SELECT COUNT(*) FROM chat_sessions;`);
      console.log('chat_sessions row count:', count.rows[0].count);
    }
  } catch (error) {
    console.error('Error checking table:', error);
  }
  process.exit(0);
}

checkTable();
