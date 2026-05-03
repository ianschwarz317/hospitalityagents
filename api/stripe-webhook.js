import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export const config = { api: { bodyParser: false } };

async function buffer(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook sig error:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const listingId = session.metadata?.listing_id;
    const listingName = session.metadata?.listing_name;
    const email = session.customer_email || session.customer_details?.email;
    const amount = session.amount_total;
    const mode = session.mode; // 'payment' or 'subscription'

    if (listingId && email) {
      await sb.from('purchases').insert({
        listing_id: listingId,
        listing_name: listingName,
        email,
        amount_cents: amount,
        mode,
        stripe_session_id: session.id,
        created_at: new Date().toISOString()
      });
    }
  }

  return res.status(200).json({ received: true });
}
