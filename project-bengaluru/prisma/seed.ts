import 'dotenv/config'; // Must be loaded first to read DATABASE_URL
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';

// Instantiate the mandatory Prisma 7 driver adapter
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const seedPath = path.join(process.cwd(), '../python-ml-service/junction_seed.json');
  const rawData = fs.readFileSync(seedPath, 'utf-8');
  const junctions = JSON.parse(rawData);

  console.log(`Read ${junctions.length} junctions. Seeding to database...`);

  for (const j of junctions) {
    await prisma.junction.upsert({
      where: { name: j.junction },
      update: {},
      create: {
        name: j.junction,
        latitude: j.latitude,
        longitude: j.longitude,
      },
    });
  }

  console.log('Database seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });