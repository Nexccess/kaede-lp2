// api/save-shigyou.js
// Path-Flow 標準スプレッドシート書込みAPI - kaede 楓 salon v2
// シート名: AI診断結果（手順書 STEP 3-2 標準11列）

import { google } from 'googleapis';

// =============================================
// シート名（SSのタブ名と完全一致必須）
// =============================================
const SHEET_NAME = 'AI診断結果';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const {
    name, phone, email,
    date, date2,
    recommended_menu, score, level, answers,
    lp, sent_at
  } = req.body;

  const SPREADSHEET_ID = process.env.SHIGYOU_SPREADSHEET_ID;
  const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!SPREADSHEET_ID || !SERVICE_ACCOUNT_JSON) {
    console.error('Missing env: SHIGYOU_SPREADSHEET_ID or GOOGLE_SERVICE_ACCOUNT_JSON');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  let credentials;
  try {
    credentials = JSON.parse(SERVICE_ACCOUNT_JSON);
  } catch (e) {
    console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', e);
    return res.status(500).json({ error: 'Invalid service account JSON' });
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // 送信日時（JST）
  const now = sent_at || new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  // =============================================
  // 標準11列（手順書 STEP 3-2 準拠）
  // A: 送信日時 / B: LP_ID / C: お名前 / D: 携帯電話
  // E: メール / F: 希望日時(第1) / G: 希望日時(第2)
  // H: おすすめメニュー / I: スコア / J: レベル / K: 診断回答
  // =============================================
  const row = [
    now,
    lp || 'kaede-v2',
    name || '',
    phone || '',
    email || '',
    date || '',
    date2 || '',
    recommended_menu || '',
    score !== undefined ? String(score) : '',
    level || '',
    answers || ''
  ];

  try {
    // シートの現在のデータ行数を確認（ヘッダー自動挿入）
    const checkRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:A2`
    });

    const existingRows = checkRes.data.values || [];

    if (existingRows.length === 0) {
      // ヘッダー行を自動挿入（初回のみ）
      const header = [
        '送信日時', 'LP_ID', 'お名前', '携帯電話', 'メールアドレス',
        '希望日時（第1）', '希望日時（第2）', 'おすすめメニュー',
        'スコア', 'レベル', '診断回答'
      ];
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [header] }
      });
    }

    // データ行を追記
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] }
    });

    console.log(`[save-shigyou] Written: ${name} / ${lp} / ${now}`);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Sheets API error:', err?.message || err);
    return res.status(500).json({ error: 'Sheets write failed', detail: String(err?.message || err) });
  }
}
