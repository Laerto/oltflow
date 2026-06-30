import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@oltflow.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin123";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists, skipping.`);
    return;
  }

  const passwordH = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { email, name: "Super Admin", passwordH, role: "admin" },
  });
  console.log(`Seeded admin user: ${email} / ${password} (change this password!)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
