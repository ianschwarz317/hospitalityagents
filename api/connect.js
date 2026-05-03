import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, email, action } = req.body;
  if (!userId || !email) return res.status(400).json({ error: 'Missing user data' });

  try {
    // Check if user already has a connected account
    const { data: profile } = await sb.from('profiles').select('stripe_account_id').eq('id', userId).single();

    let accountId = profile?.stripe_account_id;

    if (!accountId) {
      // Create a new Connected Account
      const account = await stripe.accounts.create({
        type: 'express',
        email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true }
        },
        metadata: { user_id: userId }
      });
      accountId = account.id;

      // Store the account ID
      await sb.from('profiles').update({ stripe_account_id: accountId }).eq('id', userId);
    }

    if (action === 'dashboard') {
      // Return a login link to the Stripe Express dashboard
      const loginLink = await stripe.accounts.createLoginLink(accountId);
      return res.status(200).json({ url: loginLink.url });
    }

    // Create an onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.SITE_URL}/profile?connect=refresh`,
      return_url: `${process.env.SITE_URL}/profile?connect=success`,
      type: 'account_onboarding'
    });

    return res.status(200).json({ url: accountLink.url });
  } catch (err) {
    console.error('Connect error:', err);
    return res.status(500).json({ error: err.message });
  }
}
