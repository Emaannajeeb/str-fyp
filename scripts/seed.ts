/**
 * Database seeding script
 * Run with: pnpm tsx scripts/seed.ts
 */

import { db } from '../server/db';

async function main() {
  console.log('Seeding database...');
  // Add your seed logic here
  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

