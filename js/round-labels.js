// ============================================================
// round-labels.js — the single source of truth for study-round labels.
//
// program_rounds.round_label only ever holds these three Thai strings
// (see supabase/seed.sql). apply.html's branch/round matching and
// admin.js's round-editor checkboxes both depend on this exact set —
// previously each hardcoded its own copy, which is exactly what
// caused the "branches not showing" bug (apply.html's copy said
// 'รอบเช้า'/'รอบบ่าย' while the real data/admin side used 'เช้า'/
// 'บ่าย', and nothing enforced they matched). One shared file so a
// future change only has to happen in one place.
// ============================================================

const ROUND_LABELS = ['เช้า', 'บ่าย', 'ทวิภาคี'];

// apply.html's study-round picker uses short internal codes
// (morning/afternoon/dual) rather than the Thai labels directly —
// this maps one to the other.
const ROUND_CODE_TO_LABEL = { morning: 'เช้า', afternoon: 'บ่าย', dual: 'ทวิภาคี' };
