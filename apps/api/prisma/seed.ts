/* eslint-disable no-console */
import { PrismaClient, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

const TOTAL_PRODUCTS = 10_000;
const BATCH_SIZE = 1_000;

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'Password123!';

async function seedUser() {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash },
    create: { email: DEMO_EMAIL, passwordHash },
  });
  console.log(`✓ Demo user ready → ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

async function seedProducts() {
  const existing = await prisma.product.count();
  if (existing >= TOTAL_PRODUCTS) {
    console.log(`✓ Products already seeded (${existing}). Skipping.`);
    return;
  }

  console.log(`Seeding ${TOTAL_PRODUCTS} products…`);
  // Insert in batches with deterministic, strictly increasing createdAt so the
  // keyset ordering (createdAt, id) is well-spread and pagination is stable.
  const base = new Date('2024-01-01T00:00:00.000Z').getTime();

  for (let offset = 0; offset < TOTAL_PRODUCTS; offset += BATCH_SIZE) {
    const rows: Prisma.ProductCreateManyInput[] = [];
    for (let i = 0; i < BATCH_SIZE && offset + i < TOTAL_PRODUCTS; i++) {
      const idx = offset + i;
      rows.push({
        name: faker.commerce.productName(),
        description: faker.commerce.productDescription(),
        price: faker.commerce.price({ min: 5, max: 2000 }),
        imageUrl: `https://picsum.photos/seed/product-${idx}/400/400`,
        // 1 minute apart per product → monotonic, no collisions.
        createdAt: new Date(base + idx * 60_000),
      });
    }
    await prisma.product.createMany({ data: rows });
    console.log(`  …${Math.min(offset + BATCH_SIZE, TOTAL_PRODUCTS)}/${TOTAL_PRODUCTS}`);
  }
  console.log('✓ Products seeded.');
}

async function main() {
  await seedUser();
  await seedProducts();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
