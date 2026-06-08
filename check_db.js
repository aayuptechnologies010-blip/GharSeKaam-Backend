import { prisma } from './config/prismaConfig.js';

async function main() {
  try {
    const items = await prisma.item.findMany({
      include: {
        category: true
      }
    });
    console.log("=== DB ITEMS ===");
    console.log(JSON.stringify(items, null, 2));
  } catch (error) {
    console.error("Prisma error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
