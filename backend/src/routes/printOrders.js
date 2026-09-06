import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { query } from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router=Router();
const TYPES=['PHOTOSTATE','PHOTO_PRINT','DOCUMENT_PRINT'];
const MODES=['COLOR','BW'];
const PAPER_SIZES=['A4','A5','4X6','5X7'];
const PRINT_STATUSES=['CREATED','QUEUED','PRINTING','PRINTED','CANCELLED','FAILED'];
function clean(v,max){return String(v??'').trim().slice(0,max);}
function int(v,min,max){const n=Number(v);return Number.isInteger(n)&&n>=min&&n<=max?n:null;}

// Public metadata lookup: no file download is exposed here.
router.post('/available-documents',async(req,res,next)=>{
  const sn=clean(req.body.service_number,40).toUpperCase(), token=clean(req.body.token_number,40);
  if(!/^AJK-\d{4}-[A-Z0-9]{6}$/.test(sn)||!/^\d{4}$/.test(token)) return res.status(400).json({ok:false,error:'INVALID_APPLICATION_DETAILS'});
  try{
    const result=await query(`SELECT a.id,a.total_amount,d.id AS file_id,d.original_name,d.file_type,d.file_size,d.review_status FROM applications a LEFT JOIN documents d ON d.application_id=a.id WHERE a.service_number=$1 AND a.token_number=$2 ORDER BY d.uploaded_at DESC`,[sn,token]);
    if(!result.rowCount) return res.status(404).json({ok:false,error:'APPLICATION_NOT_FOUND'});
    res.json({ok:true,application:{id:result.rows[0].id,total_amount:result.rows[0].total_amount},documents:result.rows.filter(r=>r.file_id).map(r=>({id:r.file_id,original_name:r.original_name,file_type:r.file_type,file_size:Number(r.file_size),review_status:r.review_status}))});
  }catch(err){next(err);}
});

router.post('/',async(req,res,next)=>{
  const sn=clean(req.body.service_number,40).toUpperCase(), token=clean(req.body.token_number,40);
  const fileId=clean(req.body.file_id,60), type=clean(req.body.print_type,30).toUpperCase(), mode=clean(req.body.color_mode,10).toUpperCase();
  const copies=int(req.body.copies,1,999); const duplex=Boolean(req.body.duplex); const paperSize=clean(req.body.paper_size,20).toUpperCase(); const paperType=clean(req.body.paper_type,40);
  if(!/^AJK-\d{4}-[A-Z0-9]{6}$/.test(sn)||!/^\d{4}$/.test(token)||!fileId||!TYPES.includes(type)||!MODES.includes(mode)||copies===null||!PAPER_SIZES.includes(paperSize)) return res.status(400).json({ok:false,error:'INVALID_PRINT_ORDER_DATA'});
  try{
    const result=await query(`SELECT a.id AS application_id,d.id AS file_id,d.review_status,p.id AS payment_id,p.status AS payment_status FROM applications a JOIN documents d ON d.application_id=a.id LEFT JOIN payments p ON p.application_id=a.id AND p.status='SUCCESS' WHERE a.service_number=$1 AND a.token_number=$2 AND d.id=$3 ORDER BY p.verified_at DESC NULLS LAST LIMIT 1`,[sn,token,fileId]);
    if(!result.rowCount)return res.status(404).json({ok:false,error:'DOCUMENT_NOT_FOUND'});
    const row=result.rows[0];
    if(row.review_status!=='APPROVED')return res.status(409).json({ok:false,error:'DOCUMENT_NOT_APPROVED'});
    // Phase 8 pricing foundation. Gateway-specific pricing can replace this formula later.
    const rate=(type==='PHOTO_PRINT'&&mode==='COLOR')?100:(mode==='COLOR'?10:5);
    const amount=rate*copies;
    const inserted=await query(`INSERT INTO print_orders(application_id,file_id,print_type,color_mode,copies,duplex,paper_size,paper_type,amount,payment_status,print_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING','CREATED') RETURNING id,application_id,file_id,print_type,color_mode,copies,duplex,paper_size,paper_type,amount,payment_status,print_status,created_at`,[row.application_id,row.file_id,type,mode,copies,duplex,paperSize,paperType||null,amount]);
    res.status(201).json({ok:true,print_order:inserted.rows[0],message:'Print order created. Payment is required before the order can enter the print queue.'});
  }catch(err){next(err);}
});


router.post('/status',async(req,res,next)=>{
  const sn=clean(req.body.service_number,40).toUpperCase(), token=clean(req.body.token_number,40), orderId=clean(req.body.print_order_id,60);
  if(!/^AJK-\d{4}-[A-Z0-9]{6}$/.test(sn)||!/^\d{4}$/.test(token)||!orderId)return res.status(400).json({ok:false,error:'INVALID_PRINT_STATUS_DATA'});
  try{
    const r=await query(`SELECT po.id,po.print_type,po.color_mode,po.copies,po.duplex,po.paper_size,po.amount,po.payment_status,po.print_status,po.created_at,a.service_number,a.token_number FROM print_orders po JOIN applications a ON a.id=po.application_id WHERE po.id=$1 AND a.service_number=$2 AND a.token_number=$3`,[orderId,sn,token]);
    if(!r.rowCount)return res.status(404).json({ok:false,error:'PRINT_ORDER_NOT_FOUND'});
    const payment=await query(`SELECT id,status,payment_method,transaction_id,verified_at FROM payments WHERE print_order_id=$1 ORDER BY created_at DESC LIMIT 1`,[orderId]);
    res.json({ok:true,print_order:r.rows[0],payment:payment.rows[0]||null});
  }catch(err){next(err);}
});

router.get('/',requireAuth,requireRole('ADMIN','ACCOUNT_MANAGER'),async(req,res,next)=>{
  try{
    const result=await query(`SELECT po.id,po.print_type,po.color_mode,po.copies,po.duplex,po.paper_size,po.paper_type,po.amount,po.payment_status,po.print_status,po.created_at,po.updated_at,a.service_number,a.token_number,a.customer_name,d.original_name FROM print_orders po LEFT JOIN applications a ON a.id=po.application_id LEFT JOIN documents d ON d.id=po.file_id ORDER BY po.created_at DESC LIMIT 200`);
    res.json({ok:true,print_orders:result.rows});
  }catch(err){next(err);}
});

router.post('/:id/prepare-print',requireAuth,requireRole('ADMIN','ACCOUNT_MANAGER'),async(req,res,next)=>{
  try {
    const r=await query(`SELECT po.id,po.file_id,po.payment_status,po.print_status,po.print_attempts,d.original_name,d.file_type,a.service_number,a.token_number FROM print_orders po JOIN documents d ON d.id=po.file_id JOIN applications a ON a.id=po.application_id WHERE po.id=$1`,[req.params.id]);
    if(!r.rowCount)return res.status(404).json({ok:false,error:'PRINT_ORDER_NOT_FOUND'});
    const o=r.rows[0];
    if(o.payment_status!=='VERIFIED')return res.status(409).json({ok:false,error:'PAYMENT_NOT_VERIFIED'});
    if(['CANCELLED','FAILED','PRINTED'].includes(o.print_status))return res.status(409).json({ok:false,error:'PRINT_ORDER_NOT_PRINTABLE'});
    const updated=await query(`UPDATE print_orders SET print_status='PRINTING',print_attempts=COALESCE(print_attempts,0)+1,last_print_attempt_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING id,print_status,print_attempts,last_print_attempt_at`,[req.params.id]);
    res.json({ok:true,print_job:{...updated.rows[0],file_id:o.file_id,original_name:o.original_name,file_type:o.file_type,service_number:o.service_number,token_number:o.token_number,print_url:`/api/documents/${o.file_id}/print`}});
  } catch(err){next(err);}
});

router.patch('/:id/status',requireAuth,requireRole('ADMIN','ACCOUNT_MANAGER'),async(req,res,next)=>{
 const status=clean(req.body.print_status,30).toUpperCase(); if(!PRINT_STATUSES.includes(status))return res.status(400).json({ok:false,error:'INVALID_PRINT_STATUS'});
 try{
   const current=await query(`SELECT id,payment_status,print_status FROM print_orders WHERE id=$1`,[req.params.id]);
   if(!current.rowCount)return res.status(404).json({ok:false,error:'PRINT_ORDER_NOT_FOUND'});
   const from=current.rows[0];
   if(status==='PRINTING' && from.payment_status!=='VERIFIED') return res.status(409).json({ok:false,error:'PAYMENT_NOT_VERIFIED'});
   if(status==='PRINTED' && from.print_status!=='PRINTING') return res.status(409).json({ok:false,error:'PRINT_ORDER_NOT_PRINTING'});
   const r=await query(`UPDATE print_orders SET print_status=$1,updated_at=NOW(),printed_at=CASE WHEN $1='PRINTED' THEN NOW() ELSE printed_at END,printed_by=CASE WHEN $1='PRINTED' THEN $3 ELSE printed_by END WHERE id=$2 RETURNING id,print_status,updated_at,printed_at`,[status,req.params.id,req.user.id]);
   res.json({ok:true,print_order:r.rows[0]});
 }catch(err){next(err);}
});

export default router;
