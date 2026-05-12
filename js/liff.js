// ============================================
// liff.js — LINE LIFF Integration
// ============================================

const LIFF = {
  user: null,

  async init() {
    try {
      await liff.init({ liffId: CONFIG.LIFF_ID });

      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: location.href });
        return false;
      }

      const profile = await liff.getProfile();
      this.user = {
        userId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl || '',
        statusMessage: profile.statusMessage || '',
      };

      // เก็บใน sessionStorage สำหรับหน้าอื่น
      sessionStorage.setItem('lineUser', JSON.stringify(this.user));
      return true;

    } catch (err) {
      console.error('LIFF init error:', err);
      // Dev mode fallback — ลบออกตอน production
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        this.user = {
          userId: 'dev_user_' + Date.now(),
          displayName: 'นักพัฒนา (Dev)',
          pictureUrl: '',
        };
        sessionStorage.setItem('lineUser', JSON.stringify(this.user));
        return true;
      }
      return false;
    }
  },

  getUser() {
    if (this.user) return this.user;
    const stored = sessionStorage.getItem('lineUser');
    return stored ? JSON.parse(stored) : null;
  },

  logout() {
    sessionStorage.removeItem('lineUser');
    if (liff.isLoggedIn()) liff.logout();
    location.reload();
  },

  isReady() {
    return !!this.getUser();
  },
};
