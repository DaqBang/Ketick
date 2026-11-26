// Data layer. Sekarang guna localStorage; nanti tukar ke Supabase di fail ini sahaja.
// Jadual transaksi adalah APPEND-ONLY: tiada update, tiada delete.
// Pembetulan dibuat dengan entri pembalikan (reversal).

const PREFIX = 'kawal:';

// Jadual yang tidak boleh diubah selepas ditulis
const LOCKED = new Set([
  'audit_log',
  'sales',
  'refunds',
  'payments',
  'stock_moves',
  'stock_receipts',
  'stock_adjusts',
  'stock_counts',
  'jobs',
  'job_events',
  'alert_reviews',
  'cash_moves',
]);

const read = (table) => {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + table) || '[]');
  } catch {
    return [];
  }
};

const write = (table, rows) => {
  localStorage.setItem(PREFIX + table, JSON.stringify(rows));
};

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

export const db = {
  all(table) {
    return read(table);
  },

  find(table, id) {
    return read(table).find((r) => r.id === id) || null;
  },

  where(table, fn) {
    return read(table).filter(fn);
  },

  insert(table, row) {
    const rows = read(table);
    const rec = { id: uid(), created_at: now(), ...row };
    rows.push(rec);
    write(table, rows);
    return rec;
  },

  // Untuk data induk sahaja (users, products, customers, settings)
  update(table, id, patch) {
    if (LOCKED.has(table)) throw new Error(`Jadual "${table}" tidak boleh diubah`);
    const rows = read(table);
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('Rekod tidak dijumpai');
    rows[i] = { ...rows[i], ...patch, id: rows[i].id, updated_at: now() };
    write(table, rows);
    return rows[i];
  },

  isLocked(table) {
    return LOCKED.has(table);
  },
};
