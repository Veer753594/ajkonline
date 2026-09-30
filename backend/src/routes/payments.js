import { Router } from 'express';
import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { query, pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router=Router();

const razorpay = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('RAZORPAY_NOT_CONFIGURED');
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
};

const METHODS = ['UPI','CASH','GATEWAY'];

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

// RAZORPAY ORDER CREATE — START
router.post('/razorpay/order', async (req,res,next)=>{
  const printOrderId=clean(req.body.print_order_id,60);

  if(!printOrderId){
    return res.status(400).json({
      ok:false,
      error:'PRINT_ORDER_ID_REQUIRED'
    });
  }

  try{
    const order=await query(`
      SELECT
        po.id,
        po.application_id,
        po.amount,
        po.payment_status,
        po.print_status,
        a.service_number,
        a.token_number,
        a.customer_name,
        a.customer_mobile
      FROM print_orders po
      JOIN applications a ON a.id=po.application_id
      WHERE po.id=$1
      LIMIT 1
    `,[printOrderId]);

    if(!order.rowCount){
      return res.status(404).json({
        ok:false,
        error:'PRINT_ORDER_NOT_FOUND'
      });
    }

    const po=order.rows[0];

    if(po.payment_status==='VERIFIED'){
      return res.status(409).json({
        ok:false,
        error:'PRINT_ORDER_ALREADY_PAID'
      });
    }

    if(po.print_status==='CANCELLED'){
      return res.status(409).json({
        ok:false,
        error:'PRINT_ORDER_CANCELLED'
      });
    }

    const amount=Number(po.amount);

    if(!Number.isFinite(amount) || amount<1){
      return res.status(400).json({
        ok:false,
        error:'INVALID_PAYMENT_AMOUNT'
      });
    }

    const existing=await query(`
      SELECT
        id,
        status,
        amount,
        payment_method,
        transaction_id,
        created_at
      FROM payments
      WHERE print_order_id=$1
        AND payment_method='GATEWAY'
        AND status IN ('PROCESSING','SUCCESS')
      ORDER BY created_at DESC
      LIMIT 1
    `,[printOrderId]);

    if(existing.rowCount){
      return res.status(409).json({
        ok:false,
        error:'PAYMENT_ALREADY_EXISTS',
        payment:existing.rows[0]
      });
    }

    const gateway=razorpay();

    const razorpayOrder=await gateway.orders.create({
      amount:Math.round(amount*100),
      currency:'INR',
      receipt:`AJK-${po.id}`,
      notes:{
        print_order_id:String(po.id),
        service_number:String(po.service_number),
        token_number:String(po.token_number)
      }
    });

    const inserted=await query(`
      INSERT INTO payments(
        application_id,
        print_order_id,
        amount,
        payment_method,
        transaction_id,
        status
      )
      VALUES($1,$2,$3,'GATEWAY',$4,'PROCESSING')
      RETURNING
        id,
        application_id,
        print_order_id,
        amount,
        payment_method,
        transaction_id,
        status,
        created_at
    `,[
      po.application_id,
      po.id,
      amount,
      razorpayOrder.id
    ]);

    res.status(201).json({
      ok:true,
      razorpay:{
        key_id:process.env.RAZORPAY_KEY_ID,
        order_id:razorpayOrder.id,
        amount:razorpayOrder.amount,
        currency:razorpayOrder.currency
      },
      payment:inserted.rows[0],
      print_order:{
        id:po.id,
        amount:amount,
        service_number:po.service_number,
        token_number:po.token_number
      }
    });

  }catch(err){
    if(err?.message==='RAZORPAY_NOT_CONFIGURED'){
      return res.status(503).json({
        ok:false,
        error:'RAZORPAY_NOT_CONFIGURED'
      });
    }

    next(err);
  }
});
// RAZORPAY ORDER CREATE — END

// RAZORPAY PAYMENT VERIFY — START
router.post('/razorpay/verify', async (req,res,next)=>{
  const printOrderId=clean(req.body.print_order_id,60);
  const razorpayOrderId=clean(req.body.razorpay_order_id,100);
  const razorpayPaymentId=clean(req.body.razorpay_payment_id,100);
  const razorpaySignature=clean(req.body.razorpay_signature,200);

  if(!printOrderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature){
    return res.status(400).json({
      ok:false,
      error:'RAZORPAY_PAYMENT_DETAILS_REQUIRED'
    });
  }

  try{
    const order=await query(`
      SELECT
        po.id,
        po.application_id,
        po.amount,
        po.payment_status,
        po.print_status
      FROM print_orders po
      WHERE po.id=$1
      LIMIT 1
    `,[printOrderId]);

    if(!order.rowCount){
      return res.status(404).json({
        ok:false,
        error:'PRINT_ORDER_NOT_FOUND'
      });
    }

    const po=order.rows[0];

    if(po.payment_status==='VERIFIED'){
      return res.status(409).json({
        ok:false,
        error:'PRINT_ORDER_ALREADY_PAID'
      });
    }

    const payment=await query(`
      SELECT
        id,
        status,
        transaction_id
      FROM payments
      WHERE print_order_id=$1
        AND payment_method='GATEWAY'
      ORDER BY created_at DESC
      LIMIT 1
    `,[printOrderId]);

    if(!payment.rowCount){
      return res.status(404).json({
        ok:false,
        error:'GATEWAY_PAYMENT_NOT_FOUND'
      });
    }

    const paymentRow=payment.rows[0];

    if(paymentRow.transaction_id!==razorpayOrderId){
      return res.status(400).json({
        ok:false,
        error:'RAZORPAY_ORDER_MISMATCH'
      });
    }

    if(paymentRow.status==='SUCCESS'){
      return res.status(409).json({
        ok:false,
        error:'PAYMENT_ALREADY_VERIFIED'
      });
    }

    if(!process.env.RAZORPAY_KEY_SECRET){
      return res.status(503).json({
        ok:false,
        error:'RAZORPAY_NOT_CONFIGURED'
      });
    }

    const expectedSignature=crypto
      .createHmac('sha256',process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    const signaturesMatch=
      expectedSignature.length===razorpaySignature.length &&
      crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(razorpaySignature)
      );

    if(!signaturesMatch){
      await query(`
        UPDATE payments
        SET status='FAILED'
        WHERE id=$1
      `,[paymentRow.id]);

      return res.status(400).json({
        ok:false,
        error:'RAZORPAY_SIGNATURE_INVALID'
      });
    }

    const client=await pool.connect();

    try{
      await client.query('BEGIN');

      await client.query(`
        UPDATE payments
        SET
          status='SUCCESS',
          transaction_id=$1,
          verified_at=NOW()
        WHERE id=$2
      `,[razorpayPaymentId,paymentRow.id]);

      await client.query(`
        UPDATE print_orders
        SET
          payment_status='VERIFIED',
          print_status='QUEUED',
          updated_at=NOW()
        WHERE id=$1
      `,[printOrderId]);

      await client.query('COMMIT');
    }catch(err){
      await client.query('ROLLBACK').catch(()=>{});
      throw err;
    }finally{
      client.release();
    }

    res.json({
      ok:true,
      verified:true,
      payment_status:'SUCCESS',
      print_order:{
        id:printOrderId,
        payment_status:'VERIFIED',
        print_status:'QUEUED'
      }
    });

  }catch(err){
    next(err);
  }
});
// RAZORPAY PAYMENT VERIFY — END

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
