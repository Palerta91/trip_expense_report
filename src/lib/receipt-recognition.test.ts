import assert from "node:assert/strict";
import test from "node:test";
import { createReceiptRecognitionRequest, parseReceiptRecognition, recognizeReceipt } from "./receipt-recognition";

test("parses MiniMax reasoning and JSON into a receipt draft", () => {
  const draft = parseReceiptRecognition("<think>сначала анализ изображения</think>\n```json\n{\"title\":\"\",\"merchantOriginal\":\"\u652f\u4ed8\u5b9d\u5546\u6237\",\"merchantRussian\":\"Продавец Alipay\",\"expenseDate\":\"2026-09-13\",\"amount\":\"18.50\",\"currency\":\"cny\",\"category\":\"Питание\",\"comment\":\"Оплата через Alipay\"}\n```");

  assert.deepEqual(draft, {
    title: "",
    merchantOriginal: "支付宝商户",
    merchantRussian: "Продавец Alipay",
    expenseDate: "2026-09-13",
    amount: 18.5,
    currency: "CNY",
    category: "Питание",
    comment: "Оплата через Alipay"
  });
});

test("uses the shared MiniMax request and parser", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ choices: [{ message: { content: "{\"expenseDate\":\"2026-09-13\",\"amount\":18.5,\"currency\":\"CNY\"}" } }] }), { status: 200 });
  };

  const result = await recognizeReceipt({ imageUrl: "https://files.example.test/receipt.jpg", apiKey: "test-key", model: "MiniMax-M3", fetcher });

  assert.equal(result.amount, 18.5);
  assert.equal(result.currency, "CNY");
  assert.equal(calls[0]?.url, "https://api.minimax.io/v1/chat/completions");
  assert.equal(calls[0]?.init?.body, JSON.stringify(createReceiptRecognitionRequest("https://files.example.test/receipt.jpg", "MiniMax-M3")));
});
