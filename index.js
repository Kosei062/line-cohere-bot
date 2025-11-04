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

// --- LINE署名検証 ---
function validateSignature(req) {
  const body = JSON.stringify(req.body);
  const signature = crypto
    .createHmac("SHA256", LINE_CHANNEL_SECRET)
    .update(body)
    .digest("base64");

  const headerSig = req.get("x-line-signature");
  return signature === headerSig;
}

// --- Webhook ---
app.post("/webhook", async (req, res) => {
  // 署名検証（セキュリティチェック）
  if (!validateSignature(req)) {
    console.warn("❌ Invalid signature. Request denied.");
    return res.sendStatus(403);
  }

  try {
    const events = req.body.events;
    if (!events || events.length === 0) return res.sendStatus(200);

    for (const event of events) {
      if (event.type === "message" && event.message.type === "text") {
        const userMessage = event.message.text;

        // --- Cohereに質問 ---
        const response = await cohere.chat({
          model: "command-r",
          message: userMessage,
        });

        const replyText = response.text || "すみません、よく分かりませんでした。";

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
    console.error("🚨 Error:", error);
    res.sendStatus(500);
  }
});

// --- 起動 ---
app.listen(PORT, () => console.log(`🚀 LINE + Cohere Bot is running on port ${PORT}`));
