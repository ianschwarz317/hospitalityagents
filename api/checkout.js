import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { listingName, listingPrice, listingId, userEmail, pricingModel, creatorId } = req.body;

    if (!listingName || !listingPrice || !listingId) {
      return res.status(400).json({ error: 'Missing listing data' });
    }

    const isRecurring = pricingModel === 'monthly' || pricingModel === 'yearly';
    const interval = pricingModel === 'yearly' ? 'year' : 'month';
    const amountCents = Math.round(listingPrice * 100);
    const feeCents = Math.round(amountCents * 0.10); // 10% platform fee

    // Look up the builder's Stripe Connected Account
    let stripeAccountId = null;
    if (creatorId) {
      const { data: profile } = await sb.from('profiles').select('stripe_account_id').eq('id', creatorId).single();
      stripeAccountId = profile?.stripe_account_id;
    }

    const sessionConfig = {
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      customer_email: userEmail || undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name: listingName,
              description: `HospitalityAgents.co — Full version`,
              metadata: { listing_id: String(listingId) }
            },
            ...(isRecurring ? { recurring: { interval } } : {})
          },
          quantity: 1
        }
      ],
      mode: isRecurring ? 'subscription' : 'payment',
      metadata: {
        listing_id: String(listingId),
        listing_name: listingName
      },
      success_url: `${process.env.SITE_URL}/listings?purchased=${listingId}`,
      cancel_url: `${process.env.SITE_URL}/listings`
    };

    // If builder has a connected account, split the payment
    if (stripeAccountId && amountCents > 0) {
      if (isRecurring) {
        sessionConfig.subscription_data = {
          application_fee_percent: 10,
          transfer_data: { destination: stripeAccountId }
        };
      } else {
        sessionConfig.payment_intent_data = {
          application_fee_amount: feeCents,
          transfer_data: { destination: stripeAccountId }
        };
      }
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
