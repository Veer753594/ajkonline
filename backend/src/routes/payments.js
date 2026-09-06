import { Router } from 'express';
import { query, pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router = Router();
const METHODS = ['UPI','CASH','GATEWAY'];
const STATUSES = ['PENDING','PROCESSING','SUCCESS','FAILED','REFUNDED'];
function clean(v, max){ return String(v ?? '').trim().slice(0,max); }
function validRef(v){ return /^[A-Za-z0-9._:/-]{3,160}$/.test(v); }

// Create a payment record. A real gateway is intentionally not called until gateway credentials are configured.
router.post('/', async (req,res,next)=>{
  const method=clean(req.body.payment_method,40).toUpperCase();
  const transactionId=clean(req.body.transaction_id,160);
  const printOrderId=clean(req.body.print_order_id,60);
  const serviceNumber=clean(req.body.service_number,40).toUpperCase();
  const tokenNumber=clean(req.body.token_number,40);
  if(!METHODS.includes(method)) return res.status(400).json({ok:false,error:'INVALID_PAYMENT_METHOD'});
  if(method==='UPI' && !validRef(transactionId)) return res.status(400).json({ok:false,error:'TRANSACTION_ID_REQUIRED'});
  try{
    let applicationId=null, orderId=null, amount=null;
    if(printOrderId){
      const order=await query(`SELECT id,application_id,amount,payment_status,print_status FROM print_orders WHERE id=$1`,[printOrderId]);
      if(!order.rowCount) return res.status(404).json({ok:false,error:'PRINT_ORDER_NOT_FOUND'});
      if(order.rows[0].payment_status==='VERIFIED') return res.status(409).json({ok:false,error:'PRINT_ORDER_ALREADY_PAID'});
      applicationId=order.rows[0].application_id; orderId=order.rows[0].id; amount=Number(order.rows[0].amount);
    } else {
      if(!/^AJK-\d{4}-[A-Z0-9]{6}$/.test(serviceNumber) || !/^\d{4}$/.test(tokenNumber)) return res.status(400).json({ok:false,error:'INVALID_PAYMENT_DATA'});
      const app=await query(`SELECT id,total_amount FROM applications WHERE service_number=$1 AND token_number=$2`,[serviceNumber,tokenNumber]);
      if(!app.rowCount) return res.status(404).json({ok:false,error:'APPLICATION_NOT_FOUND'});
      applicationId=app.rows[0].id; amount=Number(app.rows[0].total_amount);
    }
    if(!(amount>=0)) return res.status(400).json({ok:false,error:'INVALID_AMOUNT'});
    const existing=await query(`SELECT id,status,amount,payment_method,transaction_id,created_at FROM payments WHERE application_id=$1 AND COALESCE(print_order_id::text,'')=COALESCE($2,'') AND status IN ('PENDING','PROCESSING','SUCCESS') ORDER BY created_at DESC LIMIT 1`,[applicationId,orderId]);
    if(existing.rowCount) return res.status(409).json({ok:false,error:'PAYMENT_ALREADY_EXISTS',payment:existing.rows[0]});
    const status=method==='GATEWAY'?'PROCESSING':'PENDING';
    const inserted=await query(`INSERT INTO payments(application_id,print_order_id,amount,payment_method,transaction_id,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,application_id,print_order_id,amount,payment_method,transaction_id,status,created_at`,[applicationId,orderId,amount,method,transactionId||null,status]);
    res.status(201).json({ok:true,payment:inserted.rows[0],message:method==='GATEWAY'?'Gateway integration is pending configuration.':'Payment submitted for admin verification.'});
  }catch(err){next(err);}
});
router.get('/', requireAuth, requireRole('ADMIN','ACCOUNT_MANAGER'), async (req,res,next)=>{
  try{
    const status=clean(req.query.status,30); const params=[]; let where='';
    if(status){ if(!STATUSES.includes(status)) return res.status(400).json({ok:false,error:'INVALID_PAYMENT_STATUS'}); params.push(status); where='WHERE p.status=$1'; }
    const result=await query(`SELECT p.id,p.application_id,p.amount,p.payment_method,p.transaction_id,p.status,p.verified_at,p.created_at,p.verified_by,a.service_number,a.token_number,a.customer_name,a.customer_mobile FROM payments p LEFT JOIN applications a ON a.id=p.application_id ${where} ORDER BY p.created_at DESC LIMIT 200`,params);
    res.json({ok:true,payments:result.rows});
  }catch(err){next(err);}
});

router.patch('/:id/verify', requireAuth, requireRole('ADMIN','ACCOUNT_MANAGER'), async (req,res,next)=>{
  const status=clean(req.body.status,30).toUpperCase();
  if(!['SUCCESS','FAILED'].includes(status)) return res.status(400).json({ok:false,error:'INVALID_VERIFICATION_STATUS'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const p=await client.query(`SELECT id,application_id,print_order_id,status FROM payments WHERE id=$1 FOR UPDATE`,[req.params.id]);
    if(!p.rowCount){await client.query('ROLLBACK');return res.status(404).json({ok:false,error:'PAYMENT_NOT_FOUND'});}
    if(p.rows[0].status==='REFUNDED'){await client.query('ROLLBACK');return res.status(409).json({ok:false,error:'PAYMENT_FINALIZED'});}
    await client.query(`UPDATE payments SET status=$1,verified_by=$2,verified_at=NOW() WHERE id=$3`,[status,req.user.id,req.params.id]);
    if(p.rows[0].print_order_id){
      await client.query(`UPDATE print_orders SET payment_status=$1,print_status=$2,updated_at=NOW() WHERE id=$3`,[status==='SUCCESS'?'VERIFIED':'PENDING',status==='SUCCESS'?'QUEUED':'CREATED',p.rows[0].print_order_id]);
    }
    await client.query('COMMIT');
    res.json({ok:true,status,verified:true,print_ready:status==='SUCCESS' && Boolean(p.rows[0].print_order_id),print_order_id:p.rows[0].print_order_id||null});
  }catch(err){await client.query('ROLLBACK').catch(()=>{});next(err);}finally{client.release();}
});
export default router;
