import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: ReturnType<typeof createPrismaClient>;
}

function createPrismaClient() {
  return new PrismaClient().$extends(withAccelerate());
}

if (!global.prismaGlobal) {
  global.prismaGlobal = createPrismaClient();
}

const prisma = global.prismaGlobal;

export default prisma;
