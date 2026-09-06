import { Router } from 'express';
import { query } from '../db/pool.js';
const router = Router();
router.post('/', async (req,res,next)=>{
  const serviceNumber=String(req.body.service_number||'').trim().toUpperCase();
  const tokenNumber=String(req.body.token_number||'').trim();
  if(!/^AJK-\d{4}-[A-Z0-9]{6}$/.test(serviceNumber) || !/^\d{4}$/.test(tokenNumber)) return res.status(400).json({ok:false,error:'INVALID_TRACKING_DETAILS'});
  try{
    const app=await query(`SELECT a.id,a.service_number,a.token_number,a.status,a.total_amount,a.created_at,a.updated_at,s.name AS service_name FROM applications a JOIN services s ON s.id=a.service_id WHERE a.service_number=$1 AND a.token_number=$2`,[serviceNumber,tokenNumber]);
    if(!app.rowCount)return res.status(404).json({ok:false,error:'APPLICATION_NOT_FOUND'});
    const history=await query(`SELECT new_status,note,created_at FROM status_history WHERE application_id=$1 ORDER BY created_at ASC`,[app.rows[0].id]);
    res.json({ok:true,application:{...app.rows[0],history:history.rows}});
  }catch(err){next(err);}
});
export default router;
