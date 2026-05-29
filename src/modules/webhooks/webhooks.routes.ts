import { Router, type Request, type Response } from 'express';
import { query } from '../../db/client';
import { env } from '../../config/env';

const router = Router();

// ═══════════════════════════════════════════════════
// META WEBHOOK
// ═══════════════════════════════════════════════════

router.get('/meta', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.META_VERIFY_TOKEN) {
    console.log('✅ Webhook de Meta verificado');
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
});

router.post('/meta', async (req: Request, res: Response) => {
  // Responder 200 inmediatamente (Meta reintenta si tarda)
  res.sendStatus(200);

  try {
    const body = req.body;

    // Guardar el webhook completo para auditoría
    await query(
      `INSERT INTO webhooks_log (source, event_type, payload, processed)
       VALUES ($1, $2, $3, false)`,
      ['meta', body.object ?? 'unknown', JSON.stringify(body)]
    );

    const change = body.entry?.[0]?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    const phoneNumberId = change?.metadata?.phone_number_id;

    if (!message || !phoneNumberId) {
      console.log('📭 Webhook sin mensaje procesable');
      return;
    }

    const from = message.from;
    const text = message.text?.body ?? '';
    const messageType = message.type;
    const wamid = message.id;

    // Buscar el tenant que corresponde a este phone_number_id
    const tenantResult = await query<{ id: string }>(
      `SELECT id FROM tenants WHERE whatsapp_phone_id = $1 LIMIT 1`,
      [phoneNumberId]
    );

    const tenant = tenantResult.rows[0];
    if (!tenant) {
      console.warn('⚠️ No se encontró tenant para phone_number_id:', phoneNumberId);
      return;
    }

    console.log(`💬 Mensaje recibido en tenant ${tenant.id} desde ${from}: ${text}`);

    // TODO: aquí va la lógica completa de:
    // 1. Encontrar o crear end_customer
    // 2. Encontrar o crear conversation
    // 3. Insertar message
    // 4. Llamar a Claude para generar respuesta
    // 5. Enviar respuesta vía Meta API
    // Por ahora dejamos el evento guardado en webhooks_log

  } catch (err) {
    console.error('💥 Error procesando webhook Meta:', err);
  }
});

// ═══════════════════════════════════════════════════
// TWILIO WEBHOOK (para SMS de verificación)
// ═══════════════════════════════════════════════════

router.post('/twilio/sms', (req: Request, res: Response) => {
  const { From, To, Body } = req.body as Record<string, string>;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📩 SMS recibido en Twilio');
  console.log('De:', From, '→ Para:', To);
  console.log('Mensaje:', Body);

  const match = Body?.match(/\b\d{3}[-\s]?\d{3}\b/);
  if (match) {
    const codigo = match[0].replace(/\D/g, '');
    console.log('🔑 CÓDIGO DE META:', codigo);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  res.type('text/xml').send('<Response></Response>');
});

router.post('/twilio/voice', (_req: Request, res: Response) => {
  const twiml = `
    <Response>
      <Record transcribe="true"
              transcribeCallback="/webhook/twilio/voice/transcription"
              maxLength="30"
              playBeep="false" />
    </Response>
  `;
  res.type('text/xml').send(twiml);
});

router.post('/twilio/voice/transcription', (req: Request, res: Response) => {
  const { TranscriptionText, From } = req.body as Record<string, string>;
  console.log('📞 Transcripción de:', From, '→', TranscriptionText);

  const match = TranscriptionText?.match(/\d[\d\s-]{4,}\d/);
  if (match) {
    const codigo = match[0].replace(/\D/g, '');
    console.log('🔑 CÓDIGO DE META (voz):', codigo);
  }

  res.sendStatus(200);
});

export default router;
