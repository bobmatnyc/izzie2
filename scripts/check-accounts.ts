import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error("No DATABASE_URL");
const sql = neon(dbUrl);

async function check() {
  // Check memory entries (entities)
  const count = await sql`SELECT COUNT(*) as count FROM memory_entries`;
  console.log('Memory entries count:', count[0].count);

  // Sample a few
  const samples = await sql`SELECT id, source, type, content->>'name' as name FROM memory_entries LIMIT 5`;
  console.log('\nSample entries:');
  for (const s of samples) {
    console.log({ id: s.id.substring(0, 8) + '...', source: s.source, type: s.type, name: s.name });
  }
}
check().catch(console.error);
