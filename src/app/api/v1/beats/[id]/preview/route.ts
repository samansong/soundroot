import { NextResponse } from "next/server";
import { route } from "@/server/api";
import { previewUrl, recordPlay } from "@/server/modules/catalog";

// Public visitors may preview; returns a short-lived signed URL to the tagged preview.
export const GET = route<{ id: string }>(({ params, req }) => {
  const url = previewUrl(params.id);
  if (req.nextUrl.searchParams.get("play") === "1") recordPlay(params.id);
  return NextResponse.redirect(new URL(url, req.nextUrl.origin), 302);
});
