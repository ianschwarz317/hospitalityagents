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
    const mode = session.mode;

    // Record purchase
    const insertData = {
      listing_id: listingId || 'unknown',
      listing_name: listingName || 'Unknown listing',
      email: email || 'unknown@unknown.com',
      amount_cents: amount || 0,
      mode: mode || 'payment',
      stripe_session_id: session.id,
      created_at: new Date().toISOString()
    };

    const { error: dbError } = await sb.from('purchases').insert(insertData);
    if (dbError) console.error('DB insert error:', dbError);

    // Look up listing delivery info
    let deliveryHtml = '<p>Visit your <a href="https://hospitalityagents.co/profile">profile</a> to access your purchase.</p>';

    if (listingId) {
      const { data: listing } = await sb.from('listings').select('delivery_method, delivery_content').eq('id', listingId).single();

      if (listing?.delivery_method === 'access_code' && listing?.delivery_content) {
        const isUrl = listing.delivery_content.startsWith('http');
        deliveryHtml = isUrl
          ? `<p style="margin-bottom:16px">Access your purchase here:</p><a href="${listing.delivery_content}" style="display:inline-block;background:#1a2744;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Open Platform →</a>`
          : `<p style="margin-bottom:8px">Your access code:</p><div style="background:#f5f5f5;border-radius:8px;padding:16px;font-family:monospace;font-size:16px;font-weight:700;letter-spacing:0.02em">${listing.delivery_content}</div>`;
      } else if (listing?.delivery_method === 'file' && listing?.delivery_content) {
        const { data: urlData } = await sb.storage.from('listing-files').createSignedUrl(listing.delivery_content, 604800);
        if (urlData?.signedUrl) {
          deliveryHtml = `<p style="margin-bottom:16px">Download your purchase (link valid for 7 days):</p><a href="${urlData.signedUrl}" style="display:inline-block;background:#1a2744;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Download File →</a><p style="color:#999;font-size:12px;margin-top:12px">You can also re-download anytime from your <a href="https://hospitalityagents.co/profile">profile</a>.</p>`;
        }
      }
    }

    // Send delivery email
    if (email) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'HospitalityAgents <notifications@hospitalityagents.co>',
            to: [email],
            subject: `Your purchase: ${listingName || 'HospitalityAgents listing'}`,
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
                <h2 style="margin-bottom:4px">Purchase confirmed</h2>
                <p style="color:#666;margin-bottom:24px">Thank you for your purchase on HospitalityAgents.co</p>
                <div style="background:#f5f5f5;border-radius:12px;padding:24px;margin-bottom:24px">
                  <h3 style="margin:0 0 8px">${listingName || 'Listing'}</h3>
                  <p style="color:#666;margin:0 0 4px">${amount === 0 ? 'Free (coupon applied)' : '$' + (amount / 100).toFixed(2)}</p>
                </div>
                <div style="margin-bottom:24px">
                  ${deliveryHtml}
                </div>
                <p style="color:#999;font-size:12px;margin-top:32px">HospitalityAgents.co · CVH Studio</p>
              </div>
            `
          })
        });
      } catch (emailErr) {
        console.error('Email send error:', emailErr);
      }
    }

    return res.status(200).json({ received: true, inserted: true });
  }

  return res.status(200).json({ received: true, skipped: event.type });
}
