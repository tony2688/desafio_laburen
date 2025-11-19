// cliente de prisma para hablar con postgres
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient(); // instancia compartida