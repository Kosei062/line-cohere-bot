import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import crypto from "crypto";
import { CohereClientV2 } from "cohere-ai";

// --- 初期設定 ---
const app = express();
app.use(bodyParser.json());
const PORT = process.env.PORT || 3000;

// --- 環境変数 ---
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const cohere = new CohereClientV2({
  token: process.env.COHERE_API_KEY,
});

// --- 病院ルール（短く最適化済み） ---
const RULES = `
【担当病院の業務ルール】

■基本ルール
・部屋では帽子を着用し、スリッパを履く。

■① 納品準備
・器械は手術2日前、インプラントは1日前に納品。
・部屋外で写真撮影し、器械を取り出す。
・インプラントは後で倉庫に収納。
・担当看護師が検品。手技書がなければ印刷して持参。

■② 補充
・アロクラシック、ガンマ3を補充。

■③ 引き上げ
・使用済みのANNなどインプラント・器械を引き上げ。
・通常は看護師が前室のケースに収納済み。
・倉庫で空き箱に入れる。
・ついでに当日納品の空箱、翌日納品のインプラントを倉庫に収納。

■④ 補充FAX
・福山医科宛のFAX用紙はマグネットで掲示。
・補充後は破棄。依頼は看護師が実施。

■⑤ 納品手順
・基本はオペ担当の2人の看護師に納品。
・写真または伝票を用意し、「◯番のこれです」と1つずつ渡す。
・全体の点数を数え、看護師が青布に記入しケースに入れる。
・青布は飛ばないようデプスケージ等に固定。
・手技書はレア器械のみ2〜3部製本して持参。
・検品は担当看護師。手技書なければ印刷。
・器械出しは左側の看護師。
・ケース内の器械は全て出す。小物はサイズ別にカゴや茶こし使用。
・スクリュー類は点数合計を備考欄に記載。
・滅菌インプラントは使用チェックのため伝票を全て渡す。

■⑥ 納品書提出
・医事課でコスト票を受け取る。
・隣室で患者ID・ロットを確認。誤りがあれば修正し報告。
・こちらのミスなら持ち帰って再作成。
・消耗品の納品書も一緒に提出可。

■補足
・患者の当日退院などで催促の電話が来る場合あり。
・行けない場合は償還のみ伝える。
`;

// --- LINE署名検証 ---
function validateSignature(req) {
  // raw body string is needed for exact signature; bodyParser.json already parsed, so stringify
  const body = JSON.stringify(req.body);
  const signature = crypto
    .createHmac("SHA256", LINE_CHANNEL_SECRET || "")
    .update(body)
    .digest("base64");

  const headerSig = req.get("x-line-signature");
  return signature === headerSig;
}

// --- Webhook ---
app.post("/webhook", async (req, res) => {
  // 署名検証（環境にSECRETがあれば厳密にチェック）
  if (LINE_CHANNEL_SECRET) {
    if (!validateSignature(req)) {
      console.warn("❌ Invalid signature. Request denied.");
      return res.sendStatus(403);
    }
  }

  try {
    const events = req.body.events;
    if (!events || events.length === 0) return res.sendStatus(200);

    for (const event of events) {
      if (event.type === "message" && event.message.type === "text") {
        const userMessage = event.message.text;

        // Cohereに渡すプロンプトを作成（ルールを先に渡す）
        const prompt = `
あなたは整形外科販売代理店の病院担当AIです。
以下の業務ルールを参考に、社員の質問に簡潔に答えてください。

${RULES}

質問: ${userMessage}
回答:
        `;

        // --- Cohereに問い合わせ（完全対応版） ---
const response = await cohere.chat({
  model: "command-r",
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: prompt }
      ],
    },
  ],
});

const replyText =
  response?.message?.content?.[0]?.text ||
  response?.text ||
  "すみません、よく分かりませんでした。";


        // LINEに返信
        await axios.post(
          "https://api.line.me/v2/bot/message/reply",
          {
            replyToken: event.replyToken,
            messages: [{ type: "text", text: replyText }],
          },
          {
            headers: {
              Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          }
        );
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("🚨 Error:", error);
    res.sendStatus(500);
  }
});

// --- 起動 ---
app.listen(PORT, () => console.log(`🚀 Bot (hospital rules) running on port ${PORT}`));
