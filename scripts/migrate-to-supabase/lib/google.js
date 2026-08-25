import { google } from 'googleapis';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
];

function getAuth() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (!keyFile) {
    throw new Error(
      'Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE in .env to the path of a service ' +
      'account JSON key. The service account must be shared as Viewer on ' +
      'the spreadsheet (SHEET_ID) and on the Drive root folder.'
    );
  }
  return new google.auth.GoogleAuth({ keyFile, scopes: SCOPES });
}

export async function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

export async function getDriveClient() {
  return google.drive({ version: 'v3', auth: getAuth() });
}
