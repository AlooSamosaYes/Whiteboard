import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import cors from 'cors';

// --- Configuration & Environment ---
const PORT = process.env.PORT || 4000;
const S3_BUCKET = process.env.S3_BUCKET || 'whiteboard-snapshots-r2';

// PostgreSQL Connection Pool for Metadata Indexing
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// S3/R2 Client for Binary Yjs Storage
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'auto',
  endpoint: process.env.S3_ENDPOINT, // e.g., Cloudflare R2 endpoint
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const app = express();
app.use(cors());
// Parse raw binary bodies for Yjs blob flushes
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));
app.use(express.json());

// --- Types ---
interface RoomMetadata {
  id: string;
  title: string;
  owner_id: string;
  created_at: Date;
  last_modified: Date;
  snapshot_key: string | null;
}

// --- Endpoints ---

/**
 * GET /api/rooms/:roomId
 * Retrieves room metadata and a presigned URL to download the latest Yjs snapshot from S3.
 */
app.get('/api/rooms/:roomId', async (req: Request, res: Response) => {
  const { roomId } = req.params;

  try {
    const queryResult = await pgPool.query<RoomMetadata>(
      'SELECT id, title, owner_id, created_at, last_modified, snapshot_key FROM rooms WHERE id = $1',
      [roomId]
    );

    if (queryResult.rowCount === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const room = queryResult.rows[0];
    let downloadUrl = null;

    if (room.snapshot_key) {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: room.snapshot_key,
      });
      downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    }

    return res.status(200).json({
      metadata: room,
      snapshotUrl: downloadUrl,
    });
  } catch (error) {
    console.error('Failed to fetch room metadata:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/rooms/:roomId/flush
 * Receives a binary Yjs state update, uploads it to S3/R2, and updates the PostgreSQL index.
 * Designed to be called periodically by the Sync Worker or explicitly by the client on save.
 */
app.post('/api/rooms/:roomId/flush', async (req: Request, res: Response) => {
  const { roomId } = req.params;
  const yjsBinaryData = req.body;

  if (!Buffer.isBuffer(yjsBinaryData) || yjsBinaryData.length === 0) {
    return res.status(400).json({ error: 'Invalid or empty binary payload' });
  }

  const snapshotKey = `snapshots/${roomId}/${Date.now()}.bin`;

  try {
    // 1. Upload the binary blob to S3/R2
    const putCommand = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: snapshotKey,
      Body: yjsBinaryData,
      ContentType: 'application/octet-stream',
    });
    
    await s3Client.send(putCommand);

    // 2. Update the PostgreSQL metadata record
    const updateResult = await pgPool.query(
      `UPDATE rooms 
       SET last_modified = CURRENT_TIMESTAMP, snapshot_key = $1 
       WHERE id = $2 
       RETURNING id, last_modified`,
      [snapshotKey, roomId]
    );

    if (updateResult.rowCount === 0) {
      // If the room didn't exist, this implies a first-time flush. 
      // In a real app, you might want to auto-create it or require explicit creation first.
      return res.status(404).json({ error: 'Room record does not exist in metadata database' });
    }

    return res.status(200).json({
      success: true,
      message: 'Snapshot flushed successfully',
      lastModified: updateResult.rows[0].last_modified,
    });
  } catch (error) {
    console.error('Failed to flush snapshot:', error);
    return res.status(500).json({ error: 'Internal server error during snapshot flush' });
  }
});

/**
 * POST /api/rooms
 * Creates a new whiteboard room entry in the metadata database.
 */
app.post('/api/rooms', async (req: Request, res: Response) => {
  const { title, ownerId } = req.body;

  if (!title || !ownerId) {
    return res.status(400).json({ error: 'Missing required fields: title, ownerId' });
  }

  try {
    const result = await pgPool.query<RoomMetadata>(
      `INSERT INTO rooms (title, owner_id) 
       VALUES ($1, $2) 
       RETURNING id, title, owner_id, created_at, last_modified`,
      [title, ownerId]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Failed to create room:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Initialization ---
app.listen(PORT, () => {
  console.log(`Metadata API listening on port ${PORT}`);
  console.log(`Connected to PostgreSQL and configured for S3 bucket: ${S3_BUCKET}`);
});