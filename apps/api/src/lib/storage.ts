import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../config/env';

export interface Storage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  /** Short-lived download URL; the object itself is never public. */
  presignGet(key: string, filename: string, contentType: string): Promise<string>;
  ensureBucket(): Promise<void>;
  ping(): Promise<boolean>;
}

const contentDisposition = (filename: string) =>
  `attachment; filename="${filename.replace(/[^\w.\- ]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`;

export function createS3Storage(env: Env): Storage {
  const base = {
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  };
  const client = new S3Client({
    ...base,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
  });
  const publicEndpoint = env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT;
  const signer = new S3Client({ ...base, ...(publicEndpoint ? { endpoint: publicEndpoint } : {}) });
  const Bucket = env.S3_BUCKET;

  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ServerSideEncryption: env.S3_ENDPOINT ? undefined : 'AES256',
        }),
      );
    },
    async get(key) {
      const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      if (!res.Body) throw new Error('Empty object');
      return res.Body.transformToByteArray();
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    presignGet(key, filename, contentType) {
      return getSignedUrl(
        signer,
        new GetObjectCommand({
          Bucket,
          Key: key,
          ResponseContentDisposition: contentDisposition(filename),
          ResponseContentType: contentType,
        }),
        { expiresIn: env.S3_PRESIGN_SECONDS },
      );
    },
    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket }));
      }
    },
    async ping() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** In-memory storage for tests. */
export function createMemoryStorage(): Storage & {
  objects: Map<string, { body: Uint8Array; contentType: string }>;
} {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  return {
    objects,
    async put(key, body, contentType) {
      objects.set(key, { body, contentType });
    },
    async get(key) {
      const o = objects.get(key);
      if (!o) throw new Error('NoSuchKey');
      return o.body;
    },
    async delete(key) {
      objects.delete(key);
    },
    async presignGet(key) {
      return `memory://${key}?X-Amz-Expires=60`;
    },
    async ensureBucket() {},
    async ping() {
      return true;
    },
  };
}
