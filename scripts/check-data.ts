import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error("No DATABASE_URL");
const sql = neon(dbUrl);

async function check() {
  // Check memory_entries columns
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'memory_entries' ORDER BY ordinal_position`;
  console.log('memory_entries columns:', cols.map(c => c.column_name).join(', '));

  // Count
  const memCount = await sql`SELECT COUNT(*) as count FROM memory_entries`;
  console.log('memory_entries count:', memCount[0].count);

  const convCount = await sql`SELECT COUNT(*) as count FROM conversations`;
  console.log('conversations count:', convCount[0].count);

  const chatCount = await sql`SELECT COUNT(*) as count FROM chat_sessions`;
  console.log('chat_sessions count:', chatCount[0].count);
}
check().catch(console.error);
