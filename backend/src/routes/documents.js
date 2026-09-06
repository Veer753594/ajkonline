import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { query } from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router = Router();
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const MAX_FILE_SIZE = Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024);
const ALLOWED = new Map([
  ['application/pdf', new Set(['.pdf'])],
  ['image/jpeg', new Set(['.jpg', '.jpeg'])],
  ['image/png', new Set(['.png'])]
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 5 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedByExtension = ['.pdf', '.jpg', '.jpeg', '.png'].includes(ext);
    if (!allowedByExtension) return cb(new Error('Invalid file type'));
    cb(null, true);
  }
});

function clean(value, max) { return String(value ?? '').trim().slice(0, max); }
async function hasValidMagic(file) {
  const handle = await fs.promises.open(file.path, 'r');
  try {
    const buffer = Buffer.alloc(12);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const b = buffer.subarray(0, bytesRead);
    if (file.mimetype === 'application/pdf') return b.subarray(0, 5).toString() === '%PDF-';
    if (file.mimetype === 'image/png') return b.length >= 8 && b.equals(Buffer.from([137,80,78,71,13,10,26,10]));
    if (file.mimetype === 'image/jpeg') return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    return false;
  } finally { await handle.close(); }
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

// Customer upload: the Service Number + Token Number act as the application acknowledgement.
router.post('/', upload.array('files', 5), async (req, res, next) => {
  const serviceNumber = clean(req.body.service_number, 40).toUpperCase();
  const tokenNumber = clean(req.body.token_number, 40);
  const files = req.files || [];
  if (!/^AJK-\d{4}-[A-Z0-9]{6}$/.test(serviceNumber) || !/^\d{4}$/.test(tokenNumber)) {
    files.forEach(file => fs.unlink(file.path, () => {}));
    return res.status(400).json({ ok:false, error:'INVALID_APPLICATION_DETAILS' });
  }
  if (!files.length) return res.status(400).json({ ok:false, error:'FILE_REQUIRED' });
  try {
    const app = await query(`SELECT id FROM applications WHERE service_number=$1 AND token_number=$2`, [serviceNumber, tokenNumber]);
    if (!app.rowCount) {
      files.forEach(file => fs.unlink(file.path, () => {}));
      return res.status(404).json({ ok:false, error:'APPLICATION_NOT_FOUND' });
    }
    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const canonicalType = ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : 'image/jpeg';
      file.mimetype = canonicalType;
      if (!(await hasValidMagic(file))) {
        files.forEach(item => fs.unlink(item.path, () => {}));
        return res.status(400).json({ ok:false, error:'INVALID_FILE_CONTENT' });
      }
    }
    const saved = [];
    for (const file of files) {
      const inserted = await query(`INSERT INTO documents(application_id,original_name,stored_name,file_type,file_size,storage_path,review_status) VALUES($1,$2,$3,$4,$5,$6,'PENDING') RETURNING id,original_name,file_type,file_size,review_status,review_note,uploaded_at,reviewed_at`, [app.rows[0].id, file.originalname.slice(0,255), file.filename, file.mimetype, file.size, file.path]);
      saved.push(publicDocument(inserted.rows[0]));
    }
    res.status(201).json({ ok:true, documents:saved });
  } catch (err) {
    files.forEach(file => fs.unlink(file.path, () => {}));
    next(err);
  }
});

router.get('/application/:applicationId', requireAuth, requireRole('ADMIN','ACCOUNT_MANAGER'), async (req,res,next)=>{
  try {
    const result = await query(`SELECT id,original_name,file_type,file_size,review_status,review_note,uploaded_at,reviewed_at FROM documents WHERE application_id=$1 ORDER BY uploaded_at DESC`, [req.params.applicationId]);
    res.json({ok:true,documents:result.rows.map(publicDocument)});
  } catch(err){ next(err); }
});

router.get('/:id/print', requireAuth, requireRole('ADMIN','ACCOUNT_MANAGER'), async (req,res,next)=>{
  try {
    const result = await query(`SELECT original_name,file_type,storage_path FROM documents WHERE id=$1`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ok:false,error:'DOCUMENT_NOT_FOUND'});
    const filePath = path.resolve(result.rows[0].storage_path);
    if (!filePath.startsWith(uploadDir + path.sep) || !fs.existsSync(filePath)) return res.status(404).json({ok:false,error:'FILE_NOT_FOUND'});
    res.setHeader('Content-Type', result.rows[0].file_type);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(result.rows[0].original_name)}`);
    res.setHeader('Cache-Control', 'no-store, private');
    res.sendFile(filePath);
  } catch(err){ next(err); }
});

router.get('/:id/download', requireAuth, requireRole('ADMIN','ACCOUNT_MANAGER'), async (req,res,next)=>{
  try {
    const result=await query(`SELECT original_name,storage_path FROM documents WHERE id=$1`,[req.params.id]);
    if(!result.rowCount) return res.status(404).json({ok:false,error:'DOCUMENT_NOT_FOUND'});
    const filePath=path.resolve(result.rows[0].storage_path);
    if(!filePath.startsWith(uploadDir + path.sep) && filePath !== uploadDir) return res.status(400).json({ok:false,error:'INVALID_STORAGE_PATH'});
    if(!fs.existsSync(filePath)) return res.status(404).json({ok:false,error:'FILE_NOT_FOUND'});
    res.download(filePath, result.rows[0].original_name);
  } catch(err){ next(err); }
});

router.patch('/:id/review', requireAuth, requireRole('ADMIN','ACCOUNT_MANAGER'), async (req,res,next)=>{
  const status=clean(req.body.review_status,20);
  const note=clean(req.body.review_note,500);
  if(!['PENDING','APPROVED','REJECTED'].includes(status)) return res.status(400).json({ok:false,error:'INVALID_REVIEW_STATUS'});
  try {
    const result=await query(`UPDATE documents SET review_status=$1,review_note=$2,reviewed_by=$3,reviewed_at=NOW() WHERE id=$4 RETURNING id,review_status,review_note,reviewed_at`,[status,note||null,req.user.id,req.params.id]);
    if(!result.rowCount) return res.status(404).json({ok:false,error:'DOCUMENT_NOT_FOUND'});
    res.json({ok:true,document:result.rows[0]});
  } catch(err){next(err);}
});

export default router;
