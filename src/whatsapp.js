import { config } from './config.js';

const base = () =>
  `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`;

async function post(payload) {
  if (config.dryRun) {
    console.log('[DRY RUN send]', JSON.stringify(payload, null, 2));
    return { dryRun: true };
  }
  const res = await fetch(base(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[whatsapp send failed]', res.status, JSON.stringify(body));
    const err = new Error(body?.error?.message || `HTTP ${res.status}`);
    err.code = body?.error?.code;
    throw err;
  }
  return body;
}

export function sendText(to, text, previewUrl = false) {
  return post({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text.slice(0, 4096), preview_url: previewUrl },
  });
}

// For sending outside the 24h customer service window. The template must be
// approved in Meta > WhatsApp > Message Templates first.
export function sendTemplate(to, name, bodyParams = [], lang = 'en_US') {
  return post({
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name,
      language: { code: lang },
      components: bodyParams.length
        ? [{ type: 'body', parameters: bodyParams.map(t => ({ type: 'text', text: String(t) })) }]
        : undefined,
    },
  });
}

export function markRead(messageId) {
  if (config.dryRun) return Promise.resolve({ dryRun: true });
  return post({ messaging_product: 'whatsapp', status: 'read', message_id: messageId });
}

// Error 131047 = outside the 24h window. Fall back to an approved template.
export async function sendSmart(to, text, templateParams = null) {
  try {
    return await sendText(to, text);
  } catch (e) {
    if (e.code === 131047 && config.standingsTemplate) {
      return sendTemplate(to, config.standingsTemplate, templateParams || [text.slice(0, 1000)]);
    }
    throw e;
  }
}
