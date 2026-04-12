export default async function handler(req, res) {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify webhook secret
  const secret = req.headers['x-webhook-secret'];
  if (secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { record } = req.body;
    if (!record) return res.status(400).json({ error: 'No record' });

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'HospitalityAgents <notifications@hospitalityagents.co>',
        to: [process.env.ADMIN_EMAIL],
        subject: `🆕 New listing submitted: ${record.name}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
            <h2 style="margin-bottom:4px">New listing submitted</h2>
            <p style="color:#666;margin-bottom:24px">Waiting for your approval on HospitalityAgents</p>

            <div style="background:#f5f5f5;border-radius:12px;padding:24px;margin-bottom:24px">
              <div style="font-size:32px;margin-bottom:12px">${record.emoji || '🤖'}</div>
              <h3 style="margin:0 0 4px">${record.name}</h3>
              <p style="color:#666;margin:0 0 16px">${record.tagline}</p>
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:6px 0;color:#999;font-size:13px">Type</td><td style="padding:6px 0;font-size:13px;font-weight:600">${record.type} · ${record.category}</td></tr>
                <tr><td style="padding:6px 0;color:#999;font-size:13px">Price</td><td style="padding:6px 0;font-size:13px;font-weight:600">$${record.price}</td></tr>
                <tr><td style="padding:6px 0;color:#999;font-size:13px">Creator</td><td style="padding:6px 0;font-size:13px;font-weight:600">${record.creator_name}</td></tr>
                <tr><td style="padding:6px 0;color:#999;font-size:13px">Submitted</td><td style="padding:6px 0;font-size:13px;font-weight:600">${new Date(record.created_at).toLocaleString()}</td></tr>
              </table>
            </div>

            <a href="${process.env.SITE_URL}/admin.html" 
               style="display:inline-block;background:#3B6CF4;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
              Review in Admin Panel →
            </a>

            <p style="color:#999;font-size:12px;margin-top:24px">HospitalityAgents.co · CVH Studio</p>
          </div>
        `
      })
    });

    if (!emailRes.ok) {
      const err = await emailRes.text();
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Email failed', detail: err });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
