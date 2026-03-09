import { PrismaClient, Plan, WorkspaceRole, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // Create demo user
  const user = await prisma.user.upsert({
    where: { email: "demo@adpilot.dev" },
    update: {},
    create: {
      email: "demo@adpilot.dev",
      name: "Demo User",
      role: Role.ADMIN,
    },
  });

  // Create demo workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: "demo-workspace" },
    update: {},
    create: {
      name: "Demo Workspace",
      slug: "demo-workspace",
      plan: Plan.PRO,
      members: {
        create: {
          userId: user.id,
          role: WorkspaceRole.OWNER,
        },
      },
    },
  });

  console.log(`Created user: ${user.email}`);
  console.log(`Created workspace: ${workspace.slug}`);
  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
