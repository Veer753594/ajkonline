import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { query, pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router = Router();
const ALLOWED_STATUSES = ['SUBMITTED','UNDER_REVIEW','DOCUMENTS_REQUIRED','PROCESSING','COMPLETED','REJECTED'];

function clean(value, max) { return String(value ?? '').trim().slice(0, max); }
function validMobile(value) { return /^[6-9]\d{9}$/.test(value); }
function makeServiceNumber() {
  const year = new Date().getFullYear();
  const part = Array.from({length: 6}, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(0, 31)]).join('');
  return `AJK-${year}-${part}`;
}

async function uniqueServiceNumber(client) {
  for (let i = 0; i < 8; i++) {
    const number = makeServiceNumber();
    const found = await client.query('SELECT 1 FROM applications WHERE service_number = $1', [number]);
    if (!found.rowCount) return number;
  }
  throw new Error('SERVICE_NUMBER_GENERATION_FAILED');
}

async function nextToken(client) {
  const result = await client.query(`SELECT COALESCE(MAX(CASE WHEN token_number ~ '^[0-9]+$' THEN token_number::integer ELSE 0 END),0)+1 AS next_token FROM applications WHERE created_at::date = CURRENT_DATE`);
  return String(result.rows[0].next_token).padStart(4, '0');
}

router.post('/', async (req, res) => {
  const serviceId = clean(req.body.service_id, 60);
  const customerName = clean(req.body.customer_name, 160);
  const customerMobile = clean(req.body.customer_mobile, 20);
  if (!serviceId || !customerName || !validMobile(customerMobile)) {
    return res.status(400).json({ ok:false, error:'INVALID_APPLICATION_DATA' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const service = await client.query(`SELECT id, name, base_price FROM services WHERE id = $1 AND status = 'ACTIVE'`, [serviceId]);
    if (!service.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ok:false,error:'SERVICE_NOT_FOUND'}); }
    const serviceNumber = await uniqueServiceNumber(client);
    const tokenNumber = await nextToken(client);
    const inserted = await client.query(`INSERT INTO applications(service_id, service_number, token_number, customer_name, customer_mobile, status, total_amount) VALUES($1,$2,$3,$4,$5,'SUBMITTED',$6) RETURNING id, service_id, service_number, token_number, customer_name, customer_mobile, status, total_amount, created_at, updated_at`, [serviceId, serviceNumber, tokenNumber, customerName, customerMobile, service.rows[0].base_price]);
    const app = inserted.rows[0];
    await client.query(`INSERT INTO status_history(application_id, old_status, new_status, changed_by, note) VALUES($1,NULL,'SUBMITTED',NULL,$2)`, [app.id, 'Application received']);
    await client.query('COMMIT');
    res.status(201).json({ok:true, application:{...app, service_name:service.rows[0].name}});
  } catch (err) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error(err);
    res.status(500).json({ok:false,error:'APPLICATION_CREATE_FAILED'});
  } finally { client.release(); }
});

router.get('/', requireAuth, requireRole('ADMIN','ACCOUNT_MANAGER'), async (req,res,next)=>{
  try {
    const status = clean(req.query.status, 30);
    const params=[]; let where='';
    if (status) { if (!ALLOWED_STATUSES.includes(status)) return res.status(400).json({ok:false,error:'INVALID_STATUS'}); params.push(status); where='WHERE a.status = $1'; }
    const result=await query(`SELECT a.id,a.service_number,a.token_number,a.customer_name,a.customer_mobile,a.status,a.total_amount,a.created_at,a.updated_at,s.name AS service_name, (SELECT COUNT(*) FROM documents d WHERE d.application_id=a.id) AS documents_count FROM applications a JOIN services s ON s.id=a.service_id ${where} ORDER BY a.created_at DESC LIMIT 100`,params);
    res.json({ok:true,applications:result.rows});
  } catch(err){next(err);}
});

router.patch('/:id/status', requireAuth, requireRole('ADMIN','ACCOUNT_MANAGER'), async (req,res,next)=>{
  const status=clean(req.body.status,30); const note=clean(req.body.note,500);
  if(!ALLOWED_STATUSES.includes(status)) return res.status(400).json({ok:false,error:'INVALID_STATUS'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const current=await client.query('SELECT id,status FROM applications WHERE id=$1 FOR UPDATE',[req.params.id]);
    if(!current.rowCount){await client.query('ROLLBACK');return res.status(404).json({ok:false,error:'APPLICATION_NOT_FOUND'});}
    const oldStatus=current.rows[0].status;
    if(oldStatus!==status){
      await client.query('UPDATE applications SET status=$1,updated_at=NOW() WHERE id=$2',[status,req.params.id]);
      await client.query('INSERT INTO status_history(application_id,old_status,new_status,changed_by,note) VALUES($1,$2,$3,$4,$5)',[req.params.id,oldStatus,status,req.user.id,note||null]);
    }
    await client.query('COMMIT');
    res.json({ok:true,status,changed:oldStatus!==status});
  }catch(err){await client.query('ROLLBACK').catch(()=>{});next(err);}finally{client.release();}
});

export { ALLOWED_STATUSES };
export default router;
