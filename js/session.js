// Sesi login semasa. sessionStorage: hilang bila tab ditutup.
const KEY = 'kawal:session';

export const session = {
  get() {
    try {
      return JSON.parse(sessionStorage.getItem(KEY));
    } catch {
      return null;
    }
  },
  set(user) {
    sessionStorage.setItem(KEY, JSON.stringify(user));
  },
  clear() {
    sessionStorage.removeItem(KEY);
  },
};
