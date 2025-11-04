import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import { CohereClientV2 } from "cohere-ai";

// --- 設定 ---
const app = express();
app.use(bodyParser.json());

// Render用のポート設定
const PORT = process.env.PORT || 3000;

// Cohere APIキー（Renderの環境変数で設定する）
const cohere = new CohereClientV2({
  token: process.env.COHERE_API_KEY,
});

// --- LINE Webhook ---
app.post("/webhook", async (req, res) => {
  try {
    const events = req.body.events;
    if (!events || events.length === 0) return res.sendStatus(200);

    for (const event of events) {
      if (event.type === "message" && event.message.type === "text") {
        const userMessage = event.message.text;

        // Cohereに質問を送る
        const response = await cohere.chat({
          model: "command-r",
          message: userMessage,
        });

        const replyText = response.text || "すみません、よく分かりませんでした。";

        // LINEに返信
        await axios.post(
          "https://api.line.me/v2/bot/message/reply",
          {
            replyToken: event.replyToken,
            messages: [{ type: "text", text: replyText }],
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
            },
          }
        );
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

// --- 起動 ---
app.listen(PORT, () => console.log(`🚀 Bot is running on port ${PORT}`));
