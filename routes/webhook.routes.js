import express from 'express';
import { handleTelegramWebhook } from '../controllers/telegram-webhook.controller.js';
import { handleWebhookVerification, handleIncomingMessage } from '../controllers/whatsapp-webhook.controller.js';
// import { handleTwitterCRC, handleTwitterWebhook } from '../controllers/twitter-webhook.controller.js'; // DISABLED: Twitter not working

const router = express.Router();

router.post('/telegram/:workspace_id', handleTelegramWebhook);

// DISABLED: Twitter not working
// router.get('/twitter/:workspace_id', handleTwitterCRC);
// router.post('/twitter/:workspace_id', handleTwitterWebhook);

// Log every hit so it is obvious whether Meta is reaching the server at all
const logMetaWebhook = (channel) => (req, res, next) => {
  if (req.method === 'GET') {
    console.log(`[Webhook:${channel}] Verification request mode=${req.query['hub.mode']} has_token=${!!req.query['hub.verify_token']}`);
  } else {
    const body = req.body || {};
    console.log(`[Webhook:${channel}] POST received object=${body.object} entries=${Array.isArray(body.entry) ? body.entry.length : 0} ids=${(body.entry || []).map(e => e.id).join(',')} content-type=${req.headers['content-type']}`);
    if (!body.object) {
      console.warn(`[Webhook:${channel}] Body is empty or not JSON — check that Meta sends application/json and express.json() runs before this route`);
    }
  }
  next();
};

// Wrap handlers so Express's `next` is never passed in as the `io` argument
router.get('/facebook', logMetaWebhook('facebook'), (req, res) => handleWebhookVerification(req, res));
router.post('/facebook', logMetaWebhook('facebook'), (req, res) => handleIncomingMessage(req, res));

router.get('/instagram', logMetaWebhook('instagram'), (req, res) => handleWebhookVerification(req, res));
router.post('/instagram', logMetaWebhook('instagram'), (req, res) => handleIncomingMessage(req, res));

export default router;
