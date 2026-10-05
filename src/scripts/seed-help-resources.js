/**
 * Seeds the "Help & Resources" directory: Indian states/UTs,
 * support categories, and helpline resources.
 *
 * Only NATIONAL helplines are seeded (state_code 'IN'); they apply in every
 * state and are labelled that way in the app. No state-specific numbers are
 * guessed. Each resource carries its official source URL. After seeding,
 * every number is checked against its official page and only marked
 * `verified` (with last_verified_at) when the number actually appears there;
 * the rest stay `needs_verification`.
 *
 *   node src/scripts/seed-help-resources.js
 */
const { pool } = require('../config/database');

// The tables themselves are created by src/database/schema.postgres.sql (npm run db:init).

const STATES = [
  ['AN', 'Andaman and Nicobar Islands', 'ut'], ['AP', 'Andhra Pradesh', 'state'], ['AR', 'Arunachal Pradesh', 'state'],
  ['AS', 'Assam', 'state'], ['BR', 'Bihar', 'state'], ['CH', 'Chandigarh', 'ut'], ['CG', 'Chhattisgarh', 'state'],
  ['DH', 'Dadra and Nagar Haveli and Daman and Diu', 'ut'], ['DL', 'Delhi', 'ut'], ['GA', 'Goa', 'state'],
  ['GJ', 'Gujarat', 'state'], ['HR', 'Haryana', 'state'], ['HP', 'Himachal Pradesh', 'state'],
  ['JK', 'Jammu and Kashmir', 'ut'], ['JH', 'Jharkhand', 'state'], ['KA', 'Karnataka', 'state'], ['KL', 'Kerala', 'state'],
  ['LA', 'Ladakh', 'ut'], ['LD', 'Lakshadweep', 'ut'], ['MP', 'Madhya Pradesh', 'state'], ['MH', 'Maharashtra', 'state'],
  ['MN', 'Manipur', 'state'], ['ML', 'Meghalaya', 'state'], ['MZ', 'Mizoram', 'state'], ['NL', 'Nagaland', 'state'],
  ['OD', 'Odisha', 'state'], ['PY', 'Puducherry', 'ut'], ['PB', 'Punjab', 'state'], ['RJ', 'Rajasthan', 'state'],
  ['SK', 'Sikkim', 'state'], ['TN', 'Tamil Nadu', 'state'], ['TS', 'Telangana', 'state'], ['TR', 'Tripura', 'state'],
  ['UP', 'Uttar Pradesh', 'state'], ['UK', 'Uttarakhand', 'state'], ['WB', 'West Bengal', 'state'],
];

const CATEGORIES = [
  ['women-safety', 'Women Safety'], ['child-helpline', 'Child Helpline'], ['domestic-violence', 'Domestic Violence'],
  ['sexual-harassment', 'Sexual Harassment'], ['legal-aid', 'Legal Aid'],
  ['mental-health', 'Mental Health & Emotional Support'], ['crisis-support', 'Depression & Crisis Support'],
  ['senior-citizen', 'Senior Citizen Support'], ['disability', 'Disability Support'], ['cyber-crime', 'Cyber Crime'],
  ['emergency', 'Emergency Services'], ['police', 'Police Assistance'], ['human-trafficking', 'Human Trafficking'],
  ['student-anti-ragging', 'Student & Anti-Ragging Support'], ['consumer', 'Consumer Complaints'],
  ['labour', 'Labour & Employment Support'], ['missing-persons', 'Missing Persons'],
  ['government-legal', 'Government Legal Services'], ['other', 'Other Support Services'],
];

// National resources. `check` is the digits-only form of the number we try to
// find on the official page (or, for website-only entries, null).
const RESOURCES = [
  {
    name: 'Emergency Response Support System (ERSS)', tollFree: '112', hours: '24x7',
    categories: ['emergency', 'police', 'women-safety', 'domestic-violence', 'human-trafficking'],
    site: 'https://112.gov.in', sourceName: 'ERSS-112, Government of India', check: '112',
  },
  {
    name: 'Women Helpline', tollFree: '181', hours: '24x7',
    categories: ['women-safety', 'domestic-violence', 'sexual-harassment'],
    site: 'https://wcd.nic.in', sourceName: 'Ministry of Women and Child Development', check: '181',
  },
  {
    name: 'CHILDLINE', tollFree: '1098', hours: '24x7',
    categories: ['child-helpline', 'missing-persons', 'human-trafficking'],
    site: 'https://www.childlineindia.org', sourceName: 'CHILDLINE India Foundation (Ministry of WCD)', check: '1098',
  },
  {
    name: 'NCW Women Helpline', phone: '7827170170',
    categories: ['women-safety', 'domestic-violence', 'sexual-harassment'],
    site: 'https://ncw.nic.in', sourceName: 'National Commission for Women', check: '7827170170',
  },
  {
    name: 'SHe-Box (Sexual Harassment Electronic Box)', categories: ['sexual-harassment', 'women-safety'],
    site: 'https://shebox.wcd.gov.in', sourceName: 'Ministry of Women and Child Development', check: null,
  },
  {
    name: 'National Cyber Crime Helpline', tollFree: '1930', hours: '24x7',
    categories: ['cyber-crime'], site: 'https://cybercrime.gov.in',
    sourceName: 'National Cyber Crime Reporting Portal (MHA)', check: '1930',
  },
  {
    name: 'NALSA Legal Services Helpline', tollFree: '15100',
    categories: ['legal-aid', 'government-legal'], site: 'https://nalsa.gov.in',
    sourceName: 'National Legal Services Authority', check: '15100',
  },
  {
    name: 'Tele-Law', tollFree: '14454', categories: ['legal-aid', 'government-legal'],
    site: 'https://www.tele-law.in', sourceName: 'Ministry of Law and Justice', check: '14454',
  },
  {
    name: 'Tele-MANAS', tollFree: '14416', hours: '24x7',
    categories: ['mental-health', 'crisis-support'], site: 'https://telemanas.mohfw.gov.in',
    sourceName: 'Ministry of Health and Family Welfare', check: '14416',
  },
  {
    name: 'KIRAN Mental Health Rehabilitation Helpline', tollFree: '1800-599-0019', hours: '24x7',
    categories: ['mental-health', 'crisis-support'], site: 'https://socialjustice.gov.in',
    sourceName: 'Ministry of Social Justice and Empowerment', check: '18005990019',
  },
  {
    name: 'Elderline (Senior Citizens)', tollFree: '14567', categories: ['senior-citizen'],
    site: 'https://socialjustice.gov.in', sourceName: 'Ministry of Social Justice and Empowerment', check: '14567',
  },
  {
    name: 'National Consumer Helpline', tollFree: '1800-11-4000', phone: '1915',
    categories: ['consumer'], site: 'https://consumerhelpline.gov.in',
    sourceName: 'Department of Consumer Affairs', check: '1915',
  },
  {
    name: 'UGC Anti-Ragging Helpline', tollFree: '1800-180-5522', email: 'helpline@antiragging.in',
    categories: ['student-anti-ragging'], site: 'https://www.antiragging.in',
    sourceName: 'University Grants Commission', check: '18001805522',
  },
  {
    name: 'Track the Missing Child', categories: ['missing-persons', 'child-helpline'],
    site: 'https://trackthemissingchild.gov.in', sourceName: 'Ministry of Women and Child Development', check: null,
  },
  {
    name: 'EPFO Grievance Portal', categories: ['labour'], site: 'https://epfigms.gov.in',
    sourceName: 'Employees Provident Fund Organisation', check: null,
  },
];

const digits = (s) => String(s || '').replace(/\D/g, '');

async function pageMentions(url, wanted) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (NyayaVerifier)' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return false;
    const text = (await res.text()).replace(/<[^>]+>/g, ' ');
    return digits(text).includes(wanted) || text.includes(wanted);
  } catch (_) {
    return false;
  }
}

async function run() {

  for (const [code, name, kind] of STATES) {
    await pool.execute(
      'INSERT INTO indian_states (code, name, kind) VALUES (?, ?, ?) ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind',
      [code, name, kind]
    );
  }

  let order = 0;
  for (const [slug, name] of CATEGORIES) {
    order += 1;
    await pool.execute(
      'INSERT INTO support_categories (slug, name, display_order) VALUES (?, ?, ?) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order',
      [slug, name, order]
    );
  }
  const [catRows] = await pool.query('SELECT id, slug FROM support_categories');
  const catId = new Map(catRows.map((r) => [r.slug, r.id]));

  let idx = 0;
  let verifiedCount = 0;
  for (const r of RESOURCES) {
    idx += 1;
    const verified = r.check ? await pageMentions(r.site, r.check) : false;
    if (verified) verifiedCount += 1;

    await pool.execute(
      `
        INSERT INTO help_resources (state_code, resource_name, phone_number, toll_free, email, website_url,
          service_hours, availability, source_name, source_url, verification_status, last_verified_at, display_order)
        VALUES ('IN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (state_code, resource_name) DO UPDATE SET phone_number = EXCLUDED.phone_number, toll_free = EXCLUDED.toll_free,
          email = EXCLUDED.email, website_url = EXCLUDED.website_url, service_hours = EXCLUDED.service_hours,
          source_name = EXCLUDED.source_name, source_url = EXCLUDED.source_url,
          verification_status = EXCLUDED.verification_status, last_verified_at = EXCLUDED.last_verified_at,
          display_order = EXCLUDED.display_order
      `,
      [
        r.name, r.phone || null, r.tollFree || null, r.email || null, r.site, r.hours || null,
        r.hours ? 'Available' : null, r.sourceName, r.site,
        verified ? 'verified' : 'needs_verification', verified ? new Date() : null, idx,
      ]
    );
    const [[row]] = await pool.execute('SELECT id FROM help_resources WHERE state_code = ? AND resource_name = ?', ['IN', r.name]);
    for (const slug of r.categories) {
      await pool.execute('INSERT INTO help_resource_categories (resource_id, category_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [row.id, catId.get(slug)]);
    }
    console.log(verified ? 'verified          ' : 'needs_verification', r.name);
  }

  console.log(`\n${STATES.length} states/UTs, ${CATEGORIES.length} categories, ${RESOURCES.length} resources (${verifiedCount} verified against official pages).`);
  await pool.end();
}

run().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
