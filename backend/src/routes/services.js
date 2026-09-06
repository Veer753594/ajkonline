import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router = Router();

const cleanText = (value) => typeof value === 'string' ? value.trim() : '';
const validStatus = (value) => ['ACTIVE', 'DISABLED'].includes(value);

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT s.id, s.name, s.slug, s.description, s.base_price, s.status,
             c.name AS category, c.slug AS category_slug
      FROM services s
      JOIN service_categories c ON c.id = s.category_id
      WHERE s.status = 'ACTIVE' AND c.status = 'ACTIVE'
      ORDER BY c.name, s.name
    `);
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const categorySlug = cleanText(req.body?.category_slug);
    const name = cleanText(req.body?.name);
    const slug = cleanText(req.body?.slug);
    const description = cleanText(req.body?.description) || null;
    const price = Number(req.body?.price);

    if (!categorySlug || !name || !slug || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({ ok: false, error: 'INVALID_SERVICE_DATA' });
    }

    const category = await query(`SELECT id FROM service_categories WHERE slug = $1 AND status = 'ACTIVE'`, [categorySlug]);
    if (!category.rowCount) return res.status(400).json({ ok: false, error: 'CATEGORY_NOT_FOUND' });

    const result = await query(`
      INSERT INTO services (category_id, name, slug, description, base_price, status)
      VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
      RETURNING id, name, slug, description, base_price, status
    `, [category.rows[0].id, name, slug, description, price]);

    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'DUPLICATE_SERVICE_SLUG' });
    next(err);
  }
});

router.patch('/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const id = req.params.id;
    const name = cleanText(req.body?.name);
    const description = cleanText(req.body?.description) || null;
    const price = Number(req.body?.price);
    const status = cleanText(req.body?.status).toUpperCase();

    if (!name || !Number.isFinite(price) || price < 0 || !validStatus(status)) {
      return res.status(400).json({ ok: false, error: 'INVALID_SERVICE_DATA' });
    }

    const result = await query(`
      UPDATE services
      SET name = $1, description = $2, base_base_price = $3, status = $4, updated_at = NOW()
      WHERE id = $5
      RETURNING id, name, slug, description, base_price, status
    `, [name, description, price, status, id]);

    if (!result.rowCount) return res.status(404).json({ ok: false, error: 'SERVICE_NOT_FOUND' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

export default router;
