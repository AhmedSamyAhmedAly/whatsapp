import express from "express";
import bodyParser from "body-parser";
import "dotenv/config";
import axios from "axios";

const app = express();
app.use(bodyParser.json());

// --- Config (hardcoded for demo; better put in .env) ---
const PORT = 3000;
  const  VERIFY_TOKEN = "password";
  const  WHATSAPP_TOKEN = "EAAPwZBaO9EyYBPihGIZC8CHq58qVwtpR1ZCQhDLC7NkNbsc31AeBXHK1OQ2oPJrL1CiaLHFLIkdb4wSBdpI37HH1YIXZBrapcmA73nV3peVYPaSvFiEhlTEZCZBvdaaElx03eLTEnTXTy4Gow3ZC9pgPN0JUJeHZCc2GDSfwPkwHm1r25lZC2Q6ycpXh5eQNaPaxkhPi2ZBKYsd1y0N17L4EyV9OdWWZCdBzK28Fquy9N9jIOlDmwZDZD";  
  const  PHONE_NUMBER_ID = 745964135276698;
  const  GRAPH_VERSION = "v21.0";


  //   const  WHATSAPP_TOKEN = "EABTFlyGZAZB3oBPqSBbOBb6QdhBdIIHwltgmZCTUHVx3pGUIGoKfjvRCA370IR2hwAWwvZAvxVCNQlV01aZBiNr5HeSY4TUnYrRjkUNgFs2spz1cNIlvO6Q68sfHsdvSWJ8EjnHgmxBSIZCeO00KWHF9BxJRHJaW0TjK2Mljx7vvzZBfsa578zVX0uur8S9Q0XJ8078ZB2nRSWqTFgSSuy9ssMb5WL8IVOPZAUUefCo88AluQ";  
  // const  PHONE_NUMBER_ID = 794871887043938;

// --- Axios client ---
const graph = axios.create({
  baseURL: `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}`,
  headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
  timeout: 15000,
});

// --- Helpers ---
const ok = (res, data) => res.status(200).json(data);
const fail = (res, err, status = 500) => {
  if (axios.isAxiosError(err)) {
    return res
      .status(err.response?.status || status)
      .json({ error: err.response?.data || err.message });
  }
  return res.status(status).json({ error: err?.message || String(err) });
};

// --- Health ---
app.get("/whatsapp/health", (_req, res) => res.send("OK"));

// --- Webhook verify ---
app.get("/whatsapp/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// --- Webhook receiver ---
app.post("/whatsapp/webhook", async (req, res) => {
  // Always 200 immediately so Meta doesn't retry
  res.sendStatus(200);

  try {
    const change = req.body?.entry?.[0]?.changes?.[0];
    const value  = change?.value || {};
    const messages = value.messages || [];
    const statuses = value.statuses || [];

    // 1) Log delivery status callbacks (why a message didn’t arrive, etc.)
    if (statuses.length) {
      const s = statuses[0];
      console.log("[DELIVERY STATUS]", JSON.stringify(s, null, 2));
      if (s.status === "failed" && Array.isArray(s.errors) && s.errors.length) {
        console.error("[DELIVERY ERROR]", JSON.stringify(s.errors[0], null, 2));
      }
    }

    // 2) Handle incoming user messages (your original logic)
    if (!messages.length) return;

    const msg = messages[0];

    // best-effort: mark as read
    if (msg.id) {
      graph.post("/messages", {
        messaging_product: "whatsapp",
        status: "read",
        message_id: msg.id,
      }).catch(() => {});
    }

    // simple echo for text
    if (msg.type === "text") {
      const from = msg.from;
      const text = msg.text?.body || "";
      await graph.post("/messages", {
        messaging_product: "whatsapp",
        to: from,
        type: "text",
        text: { body: `You said: ${text}` },
      });
    }
  } catch (e) {
    console.error("[WEBHOOK PARSE ERROR]", e?.message || e);
  }
});


// --- Send text ---
app.post("/whatsapp/send/text", async (req, res) => {
  try {
    const { to, body } = req.body || {};
    if (!to || !body) return fail(res, "to and body are required", 400);

    const r = await graph.post("/messages", {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    });
    return ok(res, r.data);
  } catch (e) {
    return fail(res, e);
  }
});

// --- Send template ---
app.post("/whatsapp/send/template", async (req, res) => {
  try {
    const { to, name, language = "en_US", components } = req.body || {};
    if (!to || !name) return fail(res, "to and name are required", 400);

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name,
        language: { code: language },
        ...(components ? { components } : {}),
      },
    };
    const r = await graph.post("/messages", payload);
    return ok(res, r.data);
  } catch (e) {
    return fail(res, e);
  }
});

// --- Send image ---
app.post("/whatsapp/send/image", async (req, res) => {
  try {
    const { to, link, caption } = req.body || {};
    if (!to || !link) return fail(res, "to and link are required", 400);

    const r = await graph.post("/messages", {
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: { link, ...(caption ? { caption } : {}) },
    });
    return ok(res, r.data);
  } catch (e) {
    return fail(res, e);
  }
});

// --- Mark as read ---
app.post("/whatsapp/mark-read", async (req, res) => {
  try {
    const { messageId } = req.body || {};
    if (!messageId) return fail(res, "messageId is required", 400);

    const r = await graph.post("/messages", {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    });
    return ok(res, r.data);
  } catch (e) {
    return fail(res, e);
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}/whatsapp`);
});





// import express from "express";
// import bodyParser from "body-parser";
// import "dotenv/config";
// import WhatsApp from "whatsapp"; 

// const app = express();
// app.use(bodyParser.json());

// const {
//   PORT = 3000,
//   WEBHOOK_VERIFICATION_TOKEN,
// } = process.env;

// // أنشئ إنستانس واحدة من الـ SDK
// // سيقرأ تلقائياً CLOUD_API_ACCESS_TOKEN, WA_PHONE_NUMBER_ID, CLOUD_API_VERSION من .env
// const wa = new WhatsApp();

// // --- health ---
// app.get("/health", (_req, res) => res.send("OK"));

// // --- webhook verification (GET) ---
// app.get("/webhook", (req, res) => {
//   const mode = req.query["hub.mode"];
//   const token = req.query["hub.verify_token"];
//   const challenge = req.query["hub.challenge"];

//   if (mode === "subscribe" && token === WEBHOOK_VERIFICATION_TOKEN) {
//     return res.status(200).send(challenge);
//   }
//   return res.sendStatus(403);
// });

// // --- webhook receiver (POST) ---
// // نفس البنية، لكن الرد والإرسال عبر الـ SDK
// app.post("/webhook", async (req, res) => {
//   // دايمًا ارجع 200 بسرعة
//   res.sendStatus(200);

//   try {
//     const entry = req.body?.entry?.[0];
//     const change = entry?.changes?.[0];
//     const messages = change?.value?.messages;
//     if (!messages) return;

//     const msg = messages[0];

//     // بس لو رسالة نصية
//     if (msg.type === "text") {
//       const from = msg.from;
//       const text = msg.text?.body || "";

//       // echo reply باستخدام SDK
//       await wa.messages.text({ body: `You said: ${text}` }, from)
//         .then(r => {
//           // تقدر توصل للـ raw response لو حبيت
//           // console.log(r.rawResponse());
//         })
//         .catch(e => {
//           console.error("Send error:", e?.response || e?.message || e);
//         });

//       // (اختياري) علم الرسالة كمقروءة
//       // await wa.messages.status("read", msg.id).catch(() => {});
//     }
//   } catch (e) {
//     console.error("Webhook parse error:", e?.message || e);
//   }
// });

// // --- simple send endpoint for testing ---
// // يستخدم SDK بدل Axios
// app.post("/send", async (req, res) => {
//   try {
//     const { to, body } = req.body; // لازم يكون to رقم واتساب صالح
//     const resp = await wa.messages.text({ body }, to);
//     res.json(resp.rawResponse()); // نفس اللي بترجعه Cloud API
//   } catch (e) {
//     console.error(e?.response || e?.message || e);
//     res.status(500).json({ error: e?.response || e?.message || "send failed" });
//   }
// });

// app.listen(PORT, () => {
//   console.log(`Server on http://localhost:${PORT}`);
// });

