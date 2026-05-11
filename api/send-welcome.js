export default async function handler(req, res) {
  // Allow browser preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST."
    });
  }

  try {
    // Make sure the Resend key exists in Vercel Environment Variables
    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({
        error: "Missing RESEND_API_KEY in Vercel environment variables."
      });
    }

    // Vercel usually parses JSON automatically, but this makes it safer
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const email = body.email?.trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        error: "Valid email is required."
      });
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Coastal Flow <info@taskcoastal.com>",
        to: email,
        subject: "You’re on the Coastal Flow beta list 🌊",
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Coastal Flow</title>
            </head>

            <body style="margin:0;padding:0;background:#061a22;font-family:Arial,sans-serif;">
              <div style="width:100%;padding:32px 16px;background:linear-gradient(135deg,#061a22,#0b3544,#123f4f);box-sizing:border-box;">
                <div style="max-width:560px;margin:0 auto;background:#0d3340;border:1px solid rgba(255,255,255,.14);border-radius:28px;padding:32px;color:#effcff;box-shadow:0 24px 80px rgba(0,0,0,.35);box-sizing:border-box;">
                  
                  <div style="font-size:36px;margin-bottom:18px;">🌊</div>

                  <p style="display:inline-block;margin:0 0 18px;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.12);color:#9eeeff;font-size:12px;font-weight:800;letter-spacing:.06em;">
                    PRIVATE BETA CONFIRMED
                  </p>

                  <h1 style="font-size:36px;line-height:.95;margin:0 0 14px;color:#effcff;letter-spacing:-1.4px;">
                    You’re officially on the list.
                  </h1>

                  <p style="color:rgba(239,252,255,.75);font-size:16px;line-height:1.6;margin:0;">
                    Welcome to Coastal Flow — the calm execution system for people who want less chaos, better focus, and cleaner daily wins.
                  </p>

                  <div style="background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:20px;margin:24px 0;">
                    <strong style="display:block;color:#effcff;font-size:15px;margin-bottom:8px;">
                      What happens next?
                    </strong>

                    <p style="color:rgba(239,252,255,.7);line-height:1.6;margin:0;font-size:14px;">
                      You’ll get early updates, beta access, and first-user pricing when Coastal Flow Pro launches.
                    </p>
                  </div>

                  <a href="https://taskcoastal.vercel.app" style="display:block;text-align:center;padding:15px 18px;border-radius:18px;background:#65d9f5;color:#061a22;text-decoration:none;font-weight:900;">
                    Open Coastal Flow
                  </a>

                  <p style="margin:24px 0 0;color:rgba(239,252,255,.45);font-size:12px;text-align:center;line-height:1.6;">
                    You received this email because you joined the Coastal Flow waitlist.
                  </p>
                </div>
              </div>
            </body>
          </html>
        `
      })
    });

    const data = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend API error:", data);

      return res.status(400).json({
        error: "Resend failed to send the email.",
        details: data
      });
    }

    return res.status(200).json({
      success: true,
      message: "Welcome email sent successfully.",
      data
    });
  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: "Server error while sending welcome email.",
      details: error.message
    });
  }
}
