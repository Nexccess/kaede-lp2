// api/save-shigyou.js — Path-Flow v3.2 | kaede salon（全LP共通）
// 対象LP: kaede-v1 / kaede-v2 / kaede-lp2
// 統合: SS書込み → Googleカレンダー登録 → Resendメール通知（全3ステップ独立実行）

const { google } = require('googleapis');
const { Resend } = require('resend');

// ── クライアント固有設定 ──────────────────────────────
const SHEET_NAME   = 'AI診断結果';
const NOTIFY_EMAIL = process.env.OWNER_EMAIL || 'info.kaedesalon@gmail.com';
const FROM_EMAIL   = 'noreply@main.pathflow.org';
const CALENDAR_ID  = process.env.CALENDAR_ID  || 'info.kaedesalon@gmail.com';
const SPREADSHEET_ID = process.env.SHIGYOU_SPREADSHEET_ID;
// ─────────────────────────────────────────────────────

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    lp, name, phone, email,
    date, date2,
    recommended_menu, score, level, answers
  } = req.body || {};

  if (!name || !phone || !email || !date) {
    return res.status(400).json({ error: 'Required fields missing' });
  }

  // ── Google Auth ──────────────────────────────────────
  let auth;
  try {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/calendar'
      ]
    });
  } catch (e) {
    console.error('[save-shigyou] Auth parse error:', e.message);
    return res.status(500).json({ error: 'Auth failed' });
  }

  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const log = [];

  // ── 1. Spreadsheet ────────────────────────────────────
  try {
    if (!SPREADSHEET_ID) throw new Error('SHIGYOU_SPREADSHEET_ID not set');
    const sheets = google.sheets({ version: 'v4', auth });

    // ヘッダー確認・挿入
    let hasHeader = false;
    try {
      const chk = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!A1` });
      hasHeader = !!(chk.data.values && chk.data.values[0] && chk.data.values[0][0]);
    } catch(e) { /* シートが空 */ }

    if (!hasHeader) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['送信日時','LP_ID','お名前','携帯電話','メールアドレス','希望日時（第1）','希望日時（第2）','推奨メニュー','スコア','レベル','診断回答']] }
      });
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:K`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[now, lp||'', name, phone, email, date, date2||'', recommended_menu||'', score||'', level||'', answers||'']] }
    });
    log.push('ss:ok');
  } catch (e) {
    console.error('[save-shigyou] Sheets error:', e.message);
    log.push('ss:fail:' + e.message.slice(0, 60));
  }

  // ── 2. Google Calendar ────────────────────────────────
  try {
    const calendar = google.calendar({ version: 'v3', auth });
    const dateStr = (date || '').split(' ')[0];
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error('Invalid date: ' + dateStr);

    await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: {
        summary: `【仮予約】${name} 様`,
        description: [
          `LP: ${lp}`,
          `メニュー: ${recommended_menu} / スコア: ${score} / レベル: ${level}`,
          `電話: ${phone}`,
          `メール: ${email}`,
          `希望日時: ${date}`,
          `第2希望: ${date2 || 'なし'}`,
          `診断回答: ${answers}`
        ].join('\n'),
        start: { date: dateStr },
        end: { date: dateStr }
      }
    });
    log.push('cal:ok');
  } catch (e) {
    console.error('[save-shigyou] Calendar error:', e.message);
    log.push('cal:fail:' + e.message.slice(0, 60));
  }

  // ── 3. Resend Email ───────────────────────────────────
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) throw new Error('RESEND_API_KEY not set');

    const resend = new Resend(resendKey);
    const { error: sendErr } = await resend.emails.send({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      replyTo: email,
      subject: `【kaede salon 仮予約】${name} 様`,
      text: [
        '【kaede 楓 salon — 新規仮予約通知】',
        `受付日時 : ${now}`,
        `LP ID   : ${lp}`,
        `お名前  : ${name}`,
        `電話    : ${phone}`,
        `メール  : ${email}`,
        `第1希望 : ${date}`,
        `第2希望 : ${date2 || 'なし'}`,
        `推奨メニュー: ${recommended_menu}`,
        `スコア / レベル: ${score} / ${level}`,
        `診断回答: ${answers}`,
        '',
        '---',
        'このメールはPath-Flowシステムから自動送信されています。'
      ].join('\n')
    });
    if (sendErr) throw new Error(sendErr.message);
    log.push('email:ok');
  } catch (e) {
    console.error('[save-shigyou] Email error:', e.message);
    log.push('email:fail:' + e.message.slice(0, 60));
  }

  // SS書込み失敗はエラーとして返す（カレンダー・メールは非致命的）
  const ssFailed = log.some(l => l.startsWith('ss:fail'));
  return res.status(ssFailed ? 500 : 200).json({ ok: !ssFailed, log });
};
