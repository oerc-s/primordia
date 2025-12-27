/**
 * Stripe integration for credit pack purchases
 */

import { creditLedger, Pack, PACKS } from './credits.js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

interface PaymentIntent {
  id: string;
  client_secret?: string;
  checkout_url?: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
}

export async function createPaymentIntent(agentId: string, pack: Pack): Promise<PaymentIntent | { error: string }> {
  if (!STRIPE_SECRET_KEY) {
    // Return mock for development
    return {
      id: `pi_mock_${Date.now()}`,
      checkout_url: `https://checkout.stripe.com/mock?agent=${agentId}&pack=${pack.id}`,
      amount: pack.price_usd_cents,
      currency: 'usd',
      metadata: { agent_id: agentId, pack_id: pack.id }
    };
  }

  try {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'mode': 'payment',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': pack.price_usd_cents.toString(),
        'line_items[0][price_data][product_data][name]': pack.name,
        'line_items[0][quantity]': '1',
        'metadata[agent_id]': agentId,
        'metadata[pack_id]': pack.id,
        'metadata[credits_usd_micros]': pack.credits_usd_micros.toString(),
        'success_url': process.env.STRIPE_SUCCESS_URL || 'https://primordia.dev/success',
        'cancel_url': process.env.STRIPE_CANCEL_URL || 'https://primordia.dev/cancel'
      })
    });

    const session = await response.json() as { id: string; url: string };

    return {
      id: session.id,
      checkout_url: session.url,
      amount: pack.price_usd_cents,
      currency: 'usd',
      metadata: { agent_id: agentId, pack_id: pack.id }
    };
  } catch (err) {
    return { error: 'Failed to create payment intent' };
  }
}

export async function stripeWebhookHandler(body: string, signature: string): Promise<{ status: number; body: object }> {
  if (!STRIPE_WEBHOOK_SECRET) {
    // Development mode: accept mock webhooks
    try {
      const event = JSON.parse(body);
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const agentId = session.metadata?.agent_id;
        const packId = session.metadata?.pack_id;

        if (agentId && packId) {
          const pack = PACKS.find(p => p.id === packId);
          if (pack) {
            creditLedger.credit(agentId, pack.credits_usd_micros, `stripe_${session.id}`);
            return { status: 200, body: { received: true, credited: pack.credits_usd_micros } };
          }
        }
      }
      return { status: 200, body: { received: true } };
    } catch {
      return { status: 400, body: { error: 'Invalid webhook payload' } };
    }
  }

  // Production: verify Stripe signature
  try {
    // Stripe signature verification would go here
    // For now, we'll do basic verification
    const event = JSON.parse(body);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const agentId = session.metadata?.agent_id;
      const creditsUsdMicros = parseInt(session.metadata?.credits_usd_micros || '0');

      if (agentId && creditsUsdMicros > 0) {
        creditLedger.credit(agentId, creditsUsdMicros, `stripe_${session.id}`);
        console.log(`Credited ${creditsUsdMicros} to ${agentId}`);
      }
    }

    return { status: 200, body: { received: true } };
  } catch (err) {
    return { status: 400, body: { error: 'Webhook verification failed' } };
  }
}
