// Pengguna, PIN, peranan. Tiada akaun kongsi: setiap orang login sendiri.
import { db } from './db.js';
import { log, sha256 } from './audit.js';
import { session } from './session.js';

export const ROLES = { owner: 'Owner', manager: 'Manager', staff: 'Staf' };
const MAX_FAIL = 5;
const SYSTEM = { id: 'system', name: 'Sistem' };

export const isSetup = () => db.all('users').length > 0;
export const company = () => db.all('settings')[0]?.company || '';
export const current = () => session.get();
export const can = (...roles) => roles.includes(session.get()?.role);

const hashPin = (pin, salt) => sha256(`${salt}:${pin}`);

function checkPin(pin) {
  if (!/^\d{6}$/.test(pin)) throw new Error('PIN mesti 6 digit nombor');
}

export async function setupOwner({ companyName, name, pin }) {
  if (isSetup()) throw new Error('Sistem sudah disediakan');
  if (!companyName?.trim()) throw new Error('Nama syarikat diperlukan');
  db.insert('settings', { company: companyName.trim() });
  await log('setup', { company: companyName.trim() }, SYSTEM);
  return createUser({ name, role: 'owner', pin }, SYSTEM);
}

export async function createUser({ name, role, pin }, actor = session.get()) {
  if (!name?.trim()) throw new Error('Nama diperlukan');
  if (!ROLES[role]) throw new Error('Peranan tidak sah');
  checkPin(pin);
  const salt = crypto.randomUUID();
  const user = db.insert('users', {
    name: name.trim(),
    role,
    salt,
    pin_hash: await hashPin(pin, salt),
    active: true,
    fails: 0,
  });
  await log('user.create', { user_id: user.id, name: user.name, role }, actor);
  return user;
}

export async function login(userId, pin) {
  const u = db.find('users', userId);
  if (!u || !u.active) throw new Error('Akaun tidak aktif');
  if (u.role !== 'owner' && u.fails >= MAX_FAIL) {
    throw new Error('Akaun dikunci. Minta owner buka kunci.');
  }
  const who = { id: u.id, name: u.name };
  if ((await hashPin(pin, u.salt)) !== u.pin_hash) {
    const fails = u.fails + 1;
    db.update('users', u.id, { fails });
    await log('auth.fail', { fails }, who);
    if (u.role !== 'owner' && fails >= MAX_FAIL) {
      await log('user.locked', { user_id: u.id, name: u.name }, who);
      throw new Error('PIN salah. Akaun kini dikunci.');
    }
    throw new Error(`PIN salah (${fails} kali)`);
  }
  db.update('users', u.id, { fails: 0 });
  const s = { id: u.id, name: u.name, role: u.role, at: new Date().toISOString() };
  session.set(s);
  await log('auth.login', {}, s);
  return s;
}

export async function logout() {
  const s = session.get();
  if (s) await log('auth.logout', {}, s);
  session.clear();
}

// Kelulusan bersemuka: manager/owner masukkan PIN pada device kaunter.
// Tidak tukar sesi login. PIN salah dikira sama seperti login gagal.
export const approvers = () =>
  db.where('users', (u) => u.active && (u.role === 'owner' || u.role === 'manager'));

export async function verifyApprover(userId, pin) {
  const u = db.find('users', userId);
  if (!u || !u.active || !['owner', 'manager'].includes(u.role)) {
    throw new Error('Pelulus tidak sah');
  }
  if (u.role !== 'owner' && u.fails >= MAX_FAIL) throw new Error('Akaun pelulus dikunci');
  const who = { id: u.id, name: u.name };
  if ((await hashPin(String(pin ?? ''), u.salt)) !== u.pin_hash) {
    const fails = u.fails + 1;
    db.update('users', u.id, { fails });
    await log('auth.fail', { fails, context: 'kelulusan' }, who);
    throw new Error('PIN pelulus salah');
  }
  db.update('users', u.id, { fails: 0 });
  return { id: u.id, name: u.name, role: u.role };
}

// Kelulusan tindakan sensitif. Manager/owner lulus sendiri (tetap direkod);
// staf perlu PIN manager/owner.
export async function approval(approver) {
  const u = session.get();
  if (!u) throw new Error('Sila log masuk');
  if (u.role === 'owner' || u.role === 'manager') return { id: u.id, name: u.name, self: true };
  if (!approver?.id) throw new Error('Perlu kelulusan manager/owner');
  const a = await verifyApprover(approver.id, approver.pin);
  return { id: a.id, name: a.name, self: false };
}

function requireOwner() {
  if (!can('owner')) throw new Error('Hanya owner dibenarkan');
}

export async function unlockUser(userId) {
  requireOwner();
  const u = db.update('users', userId, { fails: 0 });
  await log('user.unlock', { user_id: u.id, name: u.name });
}

export async function setActive(userId, active) {
  requireOwner();
  if (userId === session.get().id) throw new Error('Tidak boleh nyahaktif akaun sendiri');
  const u = db.update('users', userId, { active });
  await log(active ? 'user.activate' : 'user.deactivate', { user_id: u.id, name: u.name });
}
