import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import { CohereClientV2 } from "cohere-ai";

const app = express();
app.use(bodyParser.json());

// Renderのポート設定
const PORT = process.env.PORT || 3000;

// --- 環境変数（RenderのDashboard > Environmentに設定） ---
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const COHERE_API_KEY = process.env.COHERE_API_KEY;

// --- Cohereクライアント初期化 ---
const cohere = new CohereClientV2({
  token: COHERE_API_KEY,
});

// --- Webhookの受信 ---
app.post("/webhook", async (req, res) => {
  try {
    const events = req.body.events;
    if (!events || events.length === 0) return res.sendStatus(200);

    for (const event of events) {
      // テキストメッセージ以外はスルー
      if (event.type === "message" && event.message.type === "text") {
        const userMessage = event.message.text;

        console.log(`📩 User message: ${userMessage}`);

        // --- Cohereに問い合わせ ---
        const response = await cohere.chat({
          model: "command-r-plus", // ✅ 最新モデル名
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: userMessage }],
            },
          ],
        });

        // --- 応答テキストの抽出 ---
        const replyText =
          response?.message?.content?.[0]?.text ||
          response?.text ||
          "すみません、うまく理解できませんでした。";

        console.log(`💬 Cohere reply: ${replyText}`);

        // --- LINEに返信 ---
        await axios.post(
          "https://api.line.me/v2/bot/message/reply",
          {
            replyToken: event.replyToken,
            messages: [{ type: "text", text: replyText }],
          },
          {
            headers: {
              Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
            },
          }
        );
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("🚨 Error:", error?.response?.data || error.message);
    res.sendStatus(500);
  }
});

// --- 起動 ---
app.listen(PORT, () => console.log(`🚀 LINE + Cohere Bot running on port ${PORT}`));
