import { NextResponse } from "next/server";

import { getRuntimeHealthSnapshot } from "@/lib/runtime-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getRuntimeHealthSnapshot();

  return NextResponse.json(snapshot, {
    status: snapshot.status === "ok" ? 200 : 503
  });
}
