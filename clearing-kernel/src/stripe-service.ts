// Stripe Integration for Credit Packs

import Stripe from 'stripe';
import { CreditPack } from './types.js';

export class StripeService {
  private stripe: Stripe;
  private webhookSecret: string;

  // Credit pack definitions (pack_dev and pack_5k for Day-0 flow)
  private readonly CREDIT_PACKS: CreditPack[] = [
    { pack_id: 'pack_dev', amount_usd: 1000, price_usd: 1000 },     // Dev pack $1K
    { pack_id: 'pack_5k', amount_usd: 5000, price_usd: 5000 },      // Starter $5K
    { pack_id: '100k', amount_usd: 100000, price_usd: 100000 },     // Standard $100K
    { pack_id: '250k', amount_usd: 250000, price_usd: 245000 },     // 2% discount
    { pack_id: '1m', amount_usd: 1000000, price_usd: 950000 }       // 5% discount
  ];

  constructor(secretKey: string, webhookSecret: string) {
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2023-10-16'
    });
    this.webhookSecret = webhookSecret;
  }

  /**
   * Get available credit packs
   */
  getCreditPacks(): CreditPack[] {
    return this.CREDIT_PACKS;
  }

  /**
   * Create a Stripe checkout session for credit purchase
   */
  async createCheckoutSession(pack_id: string, agent_id: string): Promise<{ url: string; session_id: string }> {
    const pack = this.CREDIT_PACKS.find(p => p.pack_id === pack_id);

    if (!pack) {
      throw new Error(`Invalid pack_id: ${pack_id}`);
    }

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Primordia Credit Pack - ${pack.pack_id}`,
              description: `$${pack.amount_usd} USD in clearing credits`,
            },
            unit_amount: Math.round(pack.price_usd * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `https://primordia.clearing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://primordia.clearing/cancel`,
      metadata: {
        agent_id,
        pack_id,
        credit_amount_usd_micros: (pack.amount_usd * 1_000_000).toString()
      },
    });

    if (!session.url) {
      throw new Error('Failed to create checkout session URL');
    }

    return {
      url: session.url,
      session_id: session.id
    };
  }

  /**
   * Verify and process a Stripe webhook
   */
  verifyWebhook(payload: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret
    );
  }

  /**
   * Extract credit purchase info from webhook event
   */
  extractCreditPurchase(event: Stripe.Event): { agent_id: string; amount_usd_micros: number; session_id: string } | null {
    if (event.type !== 'checkout.session.completed') {
      return null;
    }

    const session = event.data.object as Stripe.Checkout.Session;

    if (!session.metadata?.agent_id || !session.metadata?.credit_amount_usd_micros) {
      return null;
    }

    return {
      agent_id: session.metadata.agent_id,
      amount_usd_micros: parseInt(session.metadata.credit_amount_usd_micros, 10),
      session_id: session.id
    };
  }
}
