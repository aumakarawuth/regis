// ocr-id-card — reads the English name printed on a Thai national ID
// card photo, so apply.html doesn't need to ask the applicant to type
// it in manually. Runs server-side because it needs ANTHROPIC_API_KEY,
// which must never reach the browser.
//
// Thai ID cards only reliably print an English name (no nationality/
// ethnicity/religion/weight/height/blood type field) — this function
// intentionally extracts nothing else.
//
// Setup (one-time, cannot be done by the assistant):
//   1. Get an API key from https://console.anthropic.com
//   2. supabase secrets set ANTHROPIC_API_KEY=xxxx --project-ref bfkklmixuqpwkjzglbpf

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);
  if (!ANTHROPIC_API_KEY) return json({ success: false, message: 'ANTHROPIC_API_KEY not configured' }, 500);

  const { imageBase64, mimeType } = await req.json().catch(() => ({}));
  if (!imageBase64) return json({ success: false, message: 'imageBase64 required' }, 400);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: imageBase64 } },
          {
            type: 'text',
            text: 'This is a photo of a Thai national ID card (บัตรประจำตัวประชาชน). ' +
              'Find the English (Latin-script) name printed on it — it appears below or ' +
              'next to the Thai name, usually preceded by "Name" and "Last name". ' +
              'Reply with ONLY strict JSON, no other text: ' +
              '{"firstNameEn":"...","lastNameEn":"..."}. ' +
              'If the English name is not clearly legible, or this is not an ID card, use empty strings for both.',
          },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return json({ success: false, message: `OCR failed (${res.status}): ${text}` }, 502);
  }

  const result = await res.json();
  const textOut: string = result?.content?.[0]?.text || '{}';
  let parsed: { firstNameEn?: string; lastNameEn?: string } = {};
  try {
    const match = textOut.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : textOut);
  } catch {
    return json({ success: true, firstNameEn: '', lastNameEn: '' });
  }

  return json({ success: true, firstNameEn: parsed.firstNameEn || '', lastNameEn: parsed.lastNameEn || '' });
});
