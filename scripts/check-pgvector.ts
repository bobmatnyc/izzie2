import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error("No DATABASE_URL");
const sql = neon(dbUrl);

async function check() {
  // Check if pgvector extension is enabled
  const extensions = await sql`SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'`;
  console.log('pgvector extension:', extensions.length > 0 ? `v${extensions[0].extversion}` : 'NOT INSTALLED');

  // Check for vector columns
  const vectorCols = await sql`
    SELECT table_name, column_name, udt_name
    FROM information_schema.columns
    WHERE udt_name = 'vector'
    ORDER BY table_name
  `;
  console.log('\nVector columns:');
  vectorCols.forEach(c => console.log(`  ${c.table_name}.${c.column_name}`));
}
check().catch(console.error);
