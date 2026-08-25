// Mirrors Code.gs's sheetToObjects(): first row = headers, one object per
// following row, keyed by header name — so field names below match the old
// *_HEADERS constants in Students.gs / Programs.gs / Documents.gs exactly.
export async function readSheet(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetName,
  });
  const rows = res.data.values || [];
  if (rows.length < 2) return [];

  const [headers, ...body] = rows;
  return body
    .filter(row => row.some(cell => cell !== '' && cell !== undefined))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
      return obj;
    });
}
