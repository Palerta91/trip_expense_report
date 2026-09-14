import { GetObjectCommand } from "@aws-sdk/client-s3";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { recognitionJobs, receipts } from "@/lib/db/schema";
import { isRecognitionProxySignatureValid } from "@/lib/recognition-proxy";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  const parsedId = z.string().uuid().safeParse(receiptId);
  const url = new URL(request.url);
  const startedAt = Number(url.searchParams.get("startedAt"));
  const expiresAt = Number(url.searchParams.get("expiresAt"));
  const signature = url.searchParams.get("signature") ?? "";
  if (!parsedId.success || !isRecognitionProxySignatureValid(receiptId, startedAt, expiresAt, signature)) return new NextResponse("Not found", { status: 404 });

  const [result] = await db
    .select({ receipt: receipts })
    .from(receipts)
    .innerJoin(recognitionJobs, eq(recognitionJobs.receiptId, receipts.id))
    .where(and(eq(receipts.id, parsedId.data), eq(recognitionJobs.status, "PROCESSING"), eq(recognitionJobs.createdAt, new Date(startedAt))))
    .limit(1);
  if (!result || !result.receipt.mimeType.startsWith("image/")) return new NextResponse("Not found", { status: 404 });

  const { client, bucket } = getStorage();
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: result.receipt.objectKey }));
  if (!object.Body) return new NextResponse("Not found", { status: 404 });
  const data = await object.Body.transformToByteArray();
  return new NextResponse(Buffer.from(data), { headers: { "Content-Type": result.receipt.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
