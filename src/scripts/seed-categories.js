/**
 * Replaces the app's categories with the "Recommended for you" set
 * (Constitutional Law ... Environmental Law), each with a cover image
 * served from /assets/categories/, plus Hindi/Tamil/Telugu/Kannada names.
 * Safe to re-run: categories are upserted by slug; any category not in this
 * list is removed (this fails, by design, if a quiz still references it).
 *
 *   node src/scripts/seed-categories.js
 */
const { pool } = require('../config/database');

const CATEGORIES = [
  {
    slug: 'constitutional-law',
    name: 'Constitutional Law',
    description: 'The supreme law of India: fundamental rights, duties, directive principles and how the State is structured.',
    names: { hi: 'संवैधानिक कानून', ta: 'அரசியலமைப்புச் சட்டம்', te: 'రాజ్యాంగ చట్టం', kn: 'ಸಾಂವಿಧಾನಿಕ ಕಾನೂನು' },
  },
  {
    slug: 'criminal-evidence-law',
    name: 'Criminal & Evidence Law',
    description: 'Offences and punishments, and how facts are proved in court.',
    names: { hi: 'आपराधिक और साक्ष्य कानून', ta: 'குற்றவியல் & சாட்சிய சட்டம்', te: 'క్రిమినల్ & సాక్ష్య చట్టం', kn: 'ಕ್ರಿಮಿನಲ್ ಮತ್ತು ಸಾಕ್ಷ್ಯ ಕಾನೂನು' },
  },
  {
    slug: 'civil-general-law',
    name: 'Civil & General Law',
    description: 'Rules governing private rights and disputes: civil procedure, torts, limitation and general legal principles.',
    names: { hi: 'दीवानी और सामान्य कानून', ta: 'சிவில் & பொதுச் சட்டம்', te: 'సివిల్ & సాధారణ చట్టం', kn: 'ಸಿವಿಲ್ ಮತ್ತು ಸಾಮಾನ್ಯ ಕಾನೂನು' },
  },
  {
    slug: 'marriage-family-law',
    name: 'Marriage & Family Law',
    description: 'Marriage, divorce, maintenance, custody, adoption and succession under personal laws.',
    names: { hi: 'विवाह और पारिवारिक कानून', ta: 'திருமணம் & குடும்பச் சட்டம்', te: 'వివాహ & కుటుంబ చట్టం', kn: 'ವಿವಾಹ ಮತ್ತು ಕುಟುಂಬ ಕಾನೂನು' },
  },
  {
    slug: 'labor-industrial-law',
    name: 'Labor & Industrial Law',
    description: "Workers' rights, wages, working conditions, industrial disputes and social security.",
    names: { hi: 'श्रम और औद्योगिक कानून', ta: 'தொழிலாளர் & தொழில்துறைச் சட்டம்', te: 'కార్మిక & పారిశ్రామిక చట్టం', kn: 'ಕಾರ್ಮಿಕ ಮತ್ತು ಕೈಗಾರಿಕಾ ಕಾನೂನು' },
  },
  {
    slug: 'corporate-commercial-law',
    name: 'Corporate & Commercial Law',
    description: 'Companies, contracts, partnerships, insolvency and the rules of doing business.',
    names: { hi: 'कॉर्पोरेट और वाणिज्यिक कानून', ta: 'கார்ப்பரேட் & வணிகச் சட்டம்', te: 'కార్పొరేట్ & వాణిజ్య చట్టం', kn: 'ಕಾರ್ಪೊರೇಟ್ ಮತ್ತು ವಾಣಿಜ್ಯ ಕಾನೂನು' },
  },
  {
    slug: 'taxation-law',
    name: 'Taxation Law',
    description: 'Direct and indirect taxes, such as income tax and GST, and the rights and duties of taxpayers.',
    names: { hi: 'कराधान कानून', ta: 'வரிவிதிப்புச் சட்டம்', te: 'పన్ను చట్టం', kn: 'ತೆರಿಗೆ ಕಾನೂನು' },
  },
  {
    slug: 'cyber-intellectual-property',
    name: 'Cyber & Intellectual Property',
    description: 'Online offences, data protection, and the protection of copyrights, patents and trademarks.',
    names: { hi: 'साइबर और बौद्धिक संपदा', ta: 'சைபர் & அறிவுசார் சொத்து', te: 'సైబర్ & మేధో సంపత్తి', kn: 'ಸೈಬರ್ ಮತ್ತು ಬೌದ್ಧಿಕ ಆಸ್ತಿ' },
  },
  {
    slug: 'property-real-estate-law',
    name: 'Property & Real Estate Law',
    description: 'Ownership, transfer, tenancy, registration and the regulation of real estate.',
    names: { hi: 'संपत्ति और रियल एस्टेट कानून', ta: 'சொத்து & ரியல் எஸ்டேட் சட்டம்', te: 'ఆస్తి & రియల్ ఎస్టేట్ చట్టం', kn: 'ಆಸ್ತಿ ಮತ್ತು ರಿಯಲ್ ಎಸ್ಟೇಟ್ ಕಾನೂನು' },
  },
  {
    slug: 'banking-financial-law',
    name: 'Banking & Financial Law',
    description: 'Banking regulation, loans, negotiable instruments, securities and consumer protection in finance.',
    names: { hi: 'बैंकिंग और वित्तीय कानून', ta: 'வங்கி & நிதிச் சட்டம்', te: 'బ్యాంకింగ్ & ఆర్థిక చట్టం', kn: 'ಬ್ಯಾಂಕಿಂಗ್ ಮತ್ತು ಹಣಕಾಸು ಕಾನೂನು' },
  },
  {
    slug: 'environmental-law',
    name: 'Environmental Law',
    description: 'Protection of air, water, forests and wildlife, and the duty to prevent pollution.',
    names: { hi: 'पर्यावरण कानून', ta: 'சுற்றுச்சூழல் சட்டம்', te: 'పర్యావరణ చట్టం', kn: 'ಪರಿಸರ ಕಾನೂನು' },
  },
];

async function run() {
  const slugs = CATEGORIES.map((c) => c.slug);

  await pool.query('DELETE FROM categories WHERE slug NOT IN (?)', [slugs]);

  for (const category of CATEGORIES) {
    await pool.execute(
      `
        INSERT INTO categories (name, slug, description, image_url, is_active)
        VALUES (?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description),
          image_url = VALUES(image_url), is_active = 1
      `,
      [category.name, category.slug, category.description, `/assets/categories/${category.slug}.png`]
    );
  }

  const [rows] = await pool.query('SELECT id, slug FROM categories WHERE slug IN (?)', [slugs]);
  const idBySlug = new Map(rows.map((row) => [row.slug, Number(row.id)]));

  // Drop translations of categories that no longer exist, then re-seed names.
  await pool.query(
    "DELETE FROM translations WHERE entity_type = 'category' AND entity_id NOT IN (?)",
    [[...idBySlug.values()]]
  );

  let translated = 0;
  for (const category of CATEGORIES) {
    for (const [lang, name] of Object.entries(category.names)) {
      await pool.execute(
        `
          INSERT INTO translations (entity_type, entity_id, field_name, lang_code, translated_text)
          VALUES ('category', ?, 'name', ?, ?)
          ON DUPLICATE KEY UPDATE translated_text = VALUES(translated_text)
        `,
        [idBySlug.get(category.slug), lang, name]
      );
      translated += 1;
    }
  }

  console.log(`Seeded ${CATEGORIES.length} categories and ${translated} translated names.`);
  await pool.end();
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
