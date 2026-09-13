import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

let client: S3Client | undefined;
let bucketReady = false;

export function getStorage() {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY are required");
  }
  client ??= new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? "ru-central-1",
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey }
  });
  return { client, bucket };
}

export async function ensureBucket() {
  if (bucketReady) return;
  const { client, bucket } = getStorage();
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  bucketReady = true;
}

export async function putReceipt(objectKey: string, file: File) {
  await ensureBucket();
  const { client, bucket } = getStorage();
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    Body: Buffer.from(await file.arrayBuffer()),
    ContentType: file.type,
    ContentLength: file.size
  }));
}
