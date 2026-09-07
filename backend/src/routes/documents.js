import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { query } from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router = Router();

const MAX_FILE_SIZE = Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024);
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'documents';

const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
const supabaseSecretKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!supabaseUrl || !supabaseSecretKey) {
  console.warn('Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY.');
}

const supabase = supabaseUrl && supabaseSecretKey
  ? createClient(supabaseUrl, supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 5 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) return cb(new Error('Invalid file type'));
    cb(null, true);
  }
});

function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function canonicalType(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  return 'image/jpeg';
}

function hasValidMagic(file, mimetype) {
  const b = file.buffer;
  if (!Buffer.isBuffer(b)) return false;

  if (mimetype === 'application/pdf') {
    return b.subarray(0, 5).toString() === '%PDF-';
  }

  if (mimetype === 'image/png') {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    return b.length >= 8 && b.subarray(0, 8).equals(signature);
  }

  if (mimetype === 'image/jpeg') {
    return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  }

  return false;
}

function publicDocument(row) {
  return {
    id: row.id,
    original_name: row.original_name,
    file_type: row.file_type,
    file_size: Number(row.file_size),
    review_status: row.review_status,
    review_note: row.review_note,
    uploaded_at: row.uploaded_at,
    reviewed_at: row.reviewed_at
  };
}

async function removeStorageObjects(paths) {
  if (!supabase || !paths.length) return;
  try {
    await supabase.storage.from(STORAGE_BUCKET).remove(paths);
  } catch (err) {
    console.error('Supabase Storage cleanup failed:', err.message);
  }
}

// Customer upload: the Service Number + Token Number act as the application acknowledgement.
router.post('/', upload.array('files', 5), async (req, res, next) => {
  const serviceNumber = clean(req.body.service_number, 40).toUpperCase();
  const tokenNumber = clean(req.body.token_number, 40);
  const files = req.files || [];

  if (!supabase) {
    return res.status(503).json({ ok: false, error: 'STORAGE_NOT_CONFIGURED' });
  }

  if (!/^AJK-\d{4}-[A-Z0-9]{6}$/.test(serviceNumber) || !/^\d{4}$/.test(tokenNumber)) {
    return res.status(400).json({ ok: false, error: 'INVALID_APPLICATION_DETAILS' });
  }

  if (!files.length) {
    return res.status(400).json({ ok: false, error: 'FILE_REQUIRED' });
  }

  const uploadedPaths = [];

  try {
    const app = await query(
      `SELECT id FROM applications WHERE service_number=$1 AND token_number=$2`,
      [serviceNumber, tokenNumber]
    );

    if (!app.rowCount) {
      return res.status(404).json({ ok: false, error: 'APPLICATION_NOT_FOUND' });
    }

    const prepared = files.map((file) => {
      const fileType = canonicalType(file);
      if (!hasValidMagic(file, fileType)) {
        throw Object.assign(new Error('Invalid file content'), { code: 'INVALID_FILE_CONTENT' });
      }

      const ext = path.extname(file.originalname).toLowerCase();
      const storagePath = `${app.rows[0].id}/${randomUUID()}${ext}`;

      return { file, fileType, storagePath };
    });

    for (const item of prepared) {
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(item.storagePath, item.file.buffer, {
          contentType: item.fileType,
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        throw Object.assign(new Error(error.message), { code: 'STORAGE_UPLOAD_FAILED' });
      }

      uploadedPaths.push(item.storagePath);
    }

    const saved = [];

    try {
      for (const item of prepared) {
        const inserted = await query(
          `INSERT INTO documents
            (application_id,original_name,stored_name,file_type,file_size,storage_path,review_status)
           VALUES($1,$2,$3,$4,$5,$6,'PENDING')
           RETURNING id,original_name,file_type,file_size,review_status,review_note,uploaded_at,reviewed_at`,
          [
            app.rows[0].id,
            item.file.originalname.slice(0, 255),
            item.storagePath,
            item.fileType,
            item.file.size,
            item.storagePath
          ]
        );

        saved.push(publicDocument(inserted.rows[0]));
      }
    } catch (dbError) {
      await removeStorageObjects(uploadedPaths);
      throw dbError;
    }

    res.status(201).json({ ok: true, documents: saved });
  } catch (err) {
    await removeStorageObjects(uploadedPaths);

    if (err?.code === 'INVALID_FILE_CONTENT') {
      return res.status(400).json({ ok: false, error: 'INVALID_FILE_CONTENT' });
    }

    if (err?.code === 'STORAGE_UPLOAD_FAILED') {
      console.error('Supabase Storage upload failed:', err.message);
      return res.status(502).json({ ok: false, error: 'STORAGE_UPLOAD_FAILED' });
    }

    next(err);
  }
});

router.get('/application/:applicationId', requireAuth, requireRole('ADMIN', 'ACCOUNT_MANAGER'), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id,original_name,file_type,file_size,review_status,review_note,uploaded_at,reviewed_at
       FROM documents
       WHERE application_id=$1
       ORDER BY uploaded_at DESC`,
      [req.params.applicationId]
    );

    res.json({ ok: true, documents: result.rows.map(publicDocument) });
  } catch (err) {
    next(err);
  }
});

async function streamDocument(req, res, next) {
  try {
    if (!supabase) {
      return res.status(503).json({ ok: false, error: 'STORAGE_NOT_CONFIGURED' });
    }

    const result = await query(
      `SELECT original_name,file_type,storage_path
       FROM documents
       WHERE id=$1`,
      [req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, error: 'DOCUMENT_NOT_FOUND' });
    }

    const document = result.rows[0];

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(document.storage_path);

    if (error || !data) {
      console.error('Supabase Storage download failed:', error?.message || 'No file data');
      return res.status(404).json({ ok: false, error: 'FILE_NOT_FOUND' });
    }

    res.setHeader('Content-Type', document.file_type);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(document.original_name)}`
    );
    res.setHeader('Cache-Control', 'no-store, private');

    const arrayBuffer = await data.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    next(err);
  }
}

router.get('/:id/print', requireAuth, requireRole('ADMIN', 'ACCOUNT_MANAGER'), streamDocument);

router.get('/:id/download', requireAuth, requireRole('ADMIN', 'ACCOUNT_MANAGER'), async (req, res, next) => {
  try {
    if (!supabase) {
      return res.status(503).json({ ok: false, error: 'STORAGE_NOT_CONFIGURED' });
    }

    const result = await query(
      `SELECT original_name,file_type,storage_path
       FROM documents
       WHERE id=$1`,
      [req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, error: 'DOCUMENT_NOT_FOUND' });
    }

    const document = result.rows[0];

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(document.storage_path);

    if (error || !data) {
      console.error('Supabase Storage download failed:', error?.message || 'No file data');
      return res.status(404).json({ ok: false, error: 'FILE_NOT_FOUND' });
    }

    res.setHeader('Content-Type', document.file_type);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(document.original_name)}`
    );
    res.setHeader('Cache-Control', 'no-store, private');

    const arrayBuffer = await data.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/review', requireAuth, requireRole('ADMIN', 'ACCOUNT_MANAGER'), async (req, res, next) => {
  const status = clean(req.body.review_status, 20);
  const note = clean(req.body.review_note, 500);

  if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'INVALID_REVIEW_STATUS' });
  }

  try {
    const result = await query(
      `UPDATE documents
       SET review_status=$1,review_note=$2,reviewed_by=$3,reviewed_at=NOW()
       WHERE id=$4
       RETURNING id,review_status,review_note,reviewed_at`,
      [status, note || null, req.user.id, req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, error: 'DOCUMENT_NOT_FOUND' });
    }

    res.json({ ok: true, document: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
