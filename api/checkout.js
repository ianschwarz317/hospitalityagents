import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { listingName, listingPrice, listingId, userEmail } = req.body;

    if (!listingName || !listingPrice || !listingId) {
      return res.status(400).json({ error: 'Missing listing data' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      customer_email: userEmail || undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(listingPrice * 100),
            product_data: {
              name: listingName,
              description: `HospitalityAgents.co — Full version`,
              metadata: { listing_id: String(listingId) }
            }
          },
          quantity: 1
        }
      ],
      metadata: {
        listing_id: String(listingId),
        listing_name: listingName
      },
      success_url: `${process.env.SITE_URL}/listings?purchased=${listingId}`,
      cancel_url: `${process.env.SITE_URL}/listings`
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
