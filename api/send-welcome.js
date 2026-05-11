export default async function handler(req, res) {
  // Allow browser preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST."
    });
  }

  try {
    // Make sure Resend API key exists in Vercel
    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({
        error: "Missing RESEND_API_KEY in Vercel environment variables."
      });
    }

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

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>

<body style="margin:0; padding:0; background:#061a22; font-family:Arial, Helvetica, sans-serif; color:#effcff;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#061a22; padding:34px 14px;">
    <tr>
      <td align="center">

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:580px; background:linear-gradient(145deg,#123f4f,#092b37); border-radius:30px; overflow:hidden; border:1px solid rgba(255,255,255,0.14); box-shadow:0 28px 80px rgba(0,0,0,0.35);">
          
          <tr>
            <td style="padding:38px 32px 22px 32px; text-align:center;">
              <div style="width:68px; height:68px; line-height:68px; margin:0 auto 18px auto; border-radius:24px; background:rgba(255,255,255,0.12); font-size:32px;">
                🌊
              </div>

              <div style="display:inline-block; padding:8px 14px; border-radius:999px; background:rgba(101,217,245,0.16); color:#65d9f5; font-size:12px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase;">
                Beta access confirmed
              </div>

              <h1 style="margin:20px 0 12px 0; font-size:36px; line-height:1.05; letter-spacing:-1.6px; color:#ffffff;">
                Welcome to Coastal Flow.
              </h1>

              <p style="margin:0; color:rgba(239,252,255,0.76); font-size:16px; line-height:1.65; font-weight:600;">
                You’re officially on the private beta list. Coastal Flow is being built for calm execution, cleaner focus, and better daily productivity.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:12px 32px 0 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12); border-radius:24px;">
                <tr>
                  <td style="padding:24px;">
                    <h2 style="margin:0 0 12px 0; color:#ffffff; font-size:21px; letter-spacing:-0.5px;">
                      What happens next?
                    </h2>

                    <p style="margin:0 0 14px 0; color:rgba(239,252,255,0.72); font-size:15px; line-height:1.6;">
                      We’ll send you updates when early access opens, plus improvements, Pro features, and launch details.
                    </p>

                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td style="padding:10px 0; color:rgba(239,252,255,0.86); font-size:14px; font-weight:700;">
                          ✅ Cloud task syncing
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0; color:rgba(239,252,255,0.86); font-size:14px; font-weight:700;">
                          ✅ AI daily planning
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0; color:rgba(239,252,255,0.86); font-size:14px; font-weight:700;">
                          ✅ Productivity analytics
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0; color:rgba(239,252,255,0.86); font-size:14px; font-weight:700;">
                          ✅ Focus mode and clean execution reports
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:30px 32px 12px 32px;">
              <a href="https://taskcoastal.com" style="display:inline-block; padding:16px 26px; background:linear-gradient(135deg,#65d9f5,#22a9c9); color:#061a22; text-decoration:none; border-radius:18px; font-size:15px; font-weight:900;">
                Visit Coastal Flow
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 36px 32px; text-align:center;">
              <p style="margin:0; color:rgba(239,252,255,0.48); font-size:12px; line-height:1.6;">
                You received this email because you joined the Coastal Flow beta list.
                <br />
                Built for calm execution. 🌊
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>
`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        // Use this for testing first.
        // After verifying taskcoastal.com in Resend, change to:
        // from: "Coastal Flow <info@taskcoastal.com>",
        from: "Coastal Flow <onboarding@resend.dev>",

        to: [email],
        subject: "You’re on the Coastal Flow beta list 🌊",
        html
      })
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend error:", resendData);

      return res.status(500).json({
        error: "Email failed to send.",
        details: resendData
      });
    }

    return res.status(200).json({
      success: true,
      message: "Welcome email sent successfully.",
      data: resendData
    });

  } catch (error) {
    console.error("send-message.js error:", error);

    return res.status(500).json({
      error: "Server error while sending email."
    });
  }
}
