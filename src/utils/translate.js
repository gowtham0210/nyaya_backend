const { pool } = require('../config/database');

// Must match the language codes the Flutter app's AppLanguage uses (see
// lib/state/app_language.dart) minus 'en', which always means "use the
// base column value, no lookup needed".
const SUPPORTED_LANGS = ['hi', 'ta', 'te', 'kn'];

function normalizeLang(lang) {
  return SUPPORTED_LANGS.includes(lang) ? lang : null;
}

// Overlays rows in the `translations` table onto already-serialized items.
// `fieldMap` maps the serialized property name (e.g. "whatItMeans") to the
// column name translations were stored under (e.g. "what_it_means"). Any
// field with no stored translation yet falls back to the item's original
// (English) value — so partially-translated content never shows blank.
async function applyTranslations(items, entityType, fieldMap, lang) {
  const code = normalizeLang(lang);
  if (!code || items.length === 0) {
    return items;
  }

  const ids = items.map((item) => item.id);
  const fieldNames = Object.values(fieldMap);

  const [rows] = await pool.query(
    `
      SELECT entity_id, field_name, translated_text
      FROM translations
      WHERE entity_type = ? AND lang_code = ? AND entity_id IN (?) AND field_name IN (?)
    `,
    [entityType, code, ids, fieldNames]
  );

  if (rows.length === 0) {
    return items;
  }

  const byId = new Map();
  for (const row of rows) {
    const id = Number(row.entity_id);
    if (!byId.has(id)) {
      byId.set(id, {});
    }
    byId.get(id)[row.field_name] = row.translated_text;
  }

  return items.map((item) => {
    const translationsForItem = byId.get(item.id);
    if (!translationsForItem) {
      return item;
    }
    const translated = { ...item };
    for (const [prop, dbField] of Object.entries(fieldMap)) {
      if (translationsForItem[dbField]) {
        translated[prop] = translationsForItem[dbField];
      }
    }
    return translated;
  });
}

module.exports = { applyTranslations, SUPPORTED_LANGS, normalizeLang };
