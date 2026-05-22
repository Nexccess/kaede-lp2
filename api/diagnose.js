// api/diagnose.js
// Path-Flow 標準 AI診断エンジン - kaede 楓 salon v2
// Gemini: gemini-2.5-flash-lite 固定
// service_context: kaede_mens_depilation

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { answers, lp } = req.body;

  if (!answers || !Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: 'answers required' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set' });
  }

  const menuList = `
【パーツ別 単品】
- Sパーツ（鼻下・あご・顎下 等）: ¥700 税込
- Mパーツ（ワキ・うなじ・Vライン上 等）: ¥1,400 税込
- MLパーツ（胸・腹・ヒジ上下 等）: ¥2,800 税込
- Lパーツ（背中・おしり・VIO 等）: ¥4,200 税込
- LLパーツ（太もも・ヒザ下）: ¥4,900 税込

【スペシャルメニュー】
- 全身脱毛（VIOなし・120分）: ¥11,000 税込
- 顔のみ（25分）: ¥3,000 税込
- VIO単体（25分）: ¥4,000 税込

【Freeコース】
- 脱毛Freeコース 30分: 要問合せ
- 脱毛Freeコース 60分: 要問合せ
`;

  const prompt = `
あなたはkaede 楓 salonのAI診断アシスタントです。
東京浅草にある都度払いのメンズ脱毛サロンで、入会金・管理費・キャンセル料なしが特徴です。

以下のメニュー一覧から、ユーザーの回答に最も合ったメニューを1つ選んでください。

${menuList}

ユーザーの回答（5問）:
${answers.map((a, i) => `Q${i + 1}: ${a}`).join('\n')}

以下のJSONのみを返してください。前後に説明文・マークダウンコードブロック不要。

{
  "recommended_menu": "メニュー名",
  "price": "¥XXXXX 税込",
  "score": 数値（0〜100）,
  "level": "A" or "B" or "C",
  "reason": "このメニューをおすすめする理由（2〜3文。kaede salonの都度払い・低価格・縛りなしの特徴も自然に盛り込む）"
}

スコア・レベル基準:
- A（75〜100）: ニーズが明確で即申込み可能なユーザー
- B（50〜74）: 検討段階だがニーズあり
- C（0〜49）: まず1回お試しが最適なユーザー

service_context: kaede_mens_depilation
`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 512 }
        })
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error('Gemini API error:', err);
      return res.status(500).json({ error: 'Gemini API failed', detail: err });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('JSON parse error. rawText:', rawText);
      return res.status(500).json({ error: 'JSON parse failed', raw: rawText });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('diagnose.js unexpected error:', err);
    return res.status(500).json({ error: 'Unexpected error', detail: String(err) });
  }
}
