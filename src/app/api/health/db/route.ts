export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new Response(null, { status: 404 });
  }

  try {
    const { prisma } = await import("@/lib/db");

    await prisma.$queryRaw`SELECT 1`;

    return Response.json(
      { database: "connected" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { database: "unavailable" },
      { status: 503 },
    );
  }
}