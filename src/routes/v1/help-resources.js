const express = require('express');
const { pool } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');

const router = express.Router();

function serializeResource(row) {
  const isNational = row.state_code === 'IN';
  return {
    id: Number(row.id),
    stateCode: row.state_code,
    isNational,
    resourceName: row.resource_name,
    categories: row.category_names ? String(row.category_names).split('||') : [],
    phoneNumber: row.phone_number,
    tollFree: row.toll_free,
    email: row.email,
    websiteUrl: row.website_url,
    serviceHours: row.service_hours,
    availability: row.availability,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    verificationStatus: row.verification_status,
    lastVerifiedAt: row.last_verified_at ? new Date(row.last_verified_at).toISOString() : null,
  };
}

// GET /help-resources/states
router.get(
  '/states',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute('SELECT code, name, kind FROM indian_states ORDER BY name ASC');
    res.json({ items: rows.map((r) => ({ code: r.code, name: r.name, kind: r.kind })) });
  })
);

// GET /help-resources/categories
router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute('SELECT id, slug, name FROM support_categories ORDER BY display_order ASC');
    res.json({ items: rows.map((r) => ({ id: Number(r.id), slug: r.slug, name: r.name })) });
  })
);

// GET /help-resources?state=TN&category=women-safety
// Returns active resources for that state plus the national helplines,
// optionally narrowed to a category. Never invents fallback entries.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const state = typeof req.query.state === 'string' ? req.query.state.trim().toUpperCase() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';

    const where = ['r.is_active = 1', "(r.state_code = 'IN' OR r.state_code = ?)"];
    const params = [state || 'IN'];

    if (category) {
      where.push('EXISTS (SELECT 1 FROM help_resource_categories x JOIN support_categories xc ON xc.id = x.category_id WHERE x.resource_id = r.id AND xc.slug = ?)');
      params.push(category);
    }

    const [rows] = await pool.query(
      `
        SELECT r.*, GROUP_CONCAT(c.name ORDER BY c.display_order SEPARATOR '||') AS category_names
        FROM help_resources r
        LEFT JOIN help_resource_categories hrc ON hrc.resource_id = r.id
        LEFT JOIN support_categories c ON c.id = hrc.category_id
        WHERE ${where.join(' AND ')}
        GROUP BY r.id
        ORDER BY (r.state_code = 'IN') ASC, r.display_order ASC, r.id ASC
      `,
      params
    );

    res.json({ items: rows.map(serializeResource) });
  })
);

module.exports = router;
module.exports.serializeResource = serializeResource;
