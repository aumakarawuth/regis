// liff.js — Session helper (ไม่มี liff.init ที่นี่)

var LIFF = {

  getUser: function() {
    try {
      var s = sessionStorage.getItem('lineUser');
      return s ? JSON.parse(s) : null;
    } catch(e) { return null; }
  },

  // ถ้าไม่มี session → redirect กลับ index.html ที่ directory เดียวกัน
  requireUser: function() {
    var user = this.getUser();
    if (!user) {
      var path = location.pathname.replace(/\/[^\/]*$/, '/');
      location.href = location.origin + path + 'index.html';
      return null;
    }
    return user;
  }
};
