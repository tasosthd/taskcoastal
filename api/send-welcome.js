export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { email } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        error: "Valid email is required"
      });
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Coastal Flow <onboarding@resend.dev>",
        to: email,
        subject: "You’re on the Coastal Flow beta list 🌊",
        html: `
          <div style="margin:0;padding:32px;background:#061a22;font-family:Arial,sans-serif;">
            <div style="max-width:560px;margin:0 auto;background:#0d3340;border-radius:28px;padding:32px;color:#effcff;">
              <div style="font-size:34px;margin-bottom:18px;">🌊</div>

              <p style="display:inline-block;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.12);color:#9eeeff;font-size:12px;font-weight:800;">
                PRIVATE BETA CONFIRMED
              </p>

              <h1 style="font-size:36px;line-height:.95;margin:18px 0 12px;">
                You’re officially on the list.
              </h1>

              <p style="color:rgba(239,252,255,.75);font-size:16px;line-height:1.6;">
                Welcome to Coastal Flow — the calm execution system for people who want less chaos, better focus, and cleaner daily wins.
              </p>

              <div style="background:rgba(255,255,255,.10);border-radius:20px;padding:20px;margin:24px 0;">
                <strong>What happens next?</strong>
                <p style="color:rgba(239,252,255,.7);line-height:1.6;">
                  You’ll get early updates, beta access, and first-user pricing when Coastal Flow Pro launches.
                </p>
              </div>

              <a href="https://taskcoastal.vercel.app" style="display:block;text-align:center;padding:15px 18px;border-radius:18px;background:#65d9f5;color:#061a22;text-decoration:none;font-weight:900;">
                Open Coastal Flow
              </a>

              <p style="margin-top:24px;color:rgba(239,252,255,.45);font-size:12px;text-align:center;">
                You received this email because you joined the Coastal Flow waitlist.
              </p>
            </div>
          </div>
        `
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(400).json({
        error: data
      });
    }

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
