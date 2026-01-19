/**
 * Test chat API with proper authentication
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { dbClient } from '../src/lib/db';
import { users, sessions, memoryEntries } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = dbClient.getDb();

  console.log('\n=== Chat API Debug ===\n');

  // 1. Check if user exists
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'bob@matsuoka.com'))
    .limit(1);

  if (!user) {
    console.error('❌ User not found');
    process.exit(1);
  }

  console.log('✅ User found:', user.email, `(ID: ${user.id})`);

  // 2. Check if user has an active session
  const userSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, user.id));

  console.log(`\n📊 Sessions for user: ${userSessions.length}`);
  if (userSessions.length > 0) {
    userSessions.forEach((session, idx) => {
      const expiresAt = new Date(session.expiresAt);
      const isExpired = expiresAt < new Date();
      console.log(`  ${idx + 1}. Session ${session.id}:`);
      console.log(`     Token: ${session.token.substring(0, 20)}...`);
      console.log(`     Expires: ${expiresAt.toISOString()} ${isExpired ? '(EXPIRED)' : '(ACTIVE)'}`);
    });
  } else {
    console.log('  ⚠️  No sessions found. User needs to log in.');
  }

  // 3. Check memory entries (entities)
  const memories = await db
    .select()
    .from(memoryEntries)
    .limit(10);

  console.log(`\n📝 Memory Entries: ${memories.length}`);

  let totalEntities = 0;
  const entityTypes = new Set<string>();

  memories.forEach((memory, idx) => {
    const metadata = memory.metadata as any;
    const entities = metadata?.entities || [];
    totalEntities += entities.length;

    entities.forEach((e: any) => entityTypes.add(e.type));

    const source = metadata?.source || 'unknown';
    console.log(`  ${idx + 1}. ${source} (${memory.id.substring(0, 8)}...)`);
    console.log(`     Entities: ${entities.length}`);
    console.log(`     Created: ${new Date(memory.createdAt).toLocaleString()}`);
  });

  console.log(`\n🔍 Total Entities: ${totalEntities}`);
  console.log(`   Types: ${Array.from(entityTypes).join(', ')}`);

  // 4. Summary
  console.log('\n=== Summary ===\n');

  if (userSessions.length === 0) {
    console.log('❌ ISSUE FOUND: No active session');
    console.log('   Solution: User needs to log in at http://localhost:3300/login');
    console.log('   - OR use the chatbot AFTER logging in via the browser');
  } else {
    const hasActiveSession = userSessions.some(s => new Date(s.expiresAt) > new Date());
    if (!hasActiveSession) {
      console.log('❌ ISSUE FOUND: All sessions are expired');
      console.log('   Solution: User needs to log in again');
    } else {
      console.log('✅ Active session exists');
    }
  }

  if (totalEntities === 0) {
    console.log('❌ ISSUE FOUND: No entities extracted');
    console.log('   Solution: Sync emails first to extract entities');
  } else {
    console.log(`✅ ${totalEntities} entities available for chat`);
  }

  console.log('\n=== Testing Flow ===\n');
  console.log('1. Open browser: http://localhost:3300');
  console.log('2. Log in with: bob@matsuoka.com');
  console.log('3. Navigate to: http://localhost:3300/dashboard/chat');
  console.log('4. Ask: "Who have I been emailing?"');
  console.log('5. Expected: Chatbot should respond with entities from emails');

  process.exit(0);
}

main().catch(console.error);
