const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST."
    });
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        error: "Missing STRIPE_SECRET_KEY in Vercel environment variables."
      });
    }

    if (!process.env.SUPABASE_URL) {
      return res.status(500).json({
        error: "Missing SUPABASE_URL in Vercel environment variables."
      });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        error: "Missing SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables."
      });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { userId } = req.body || {};

    if (!userId) {
      return res.status(400).json({
        error: "Missing userId."
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      return res.status(500).json({
        error: profileError.message
      });
    }

    if (!profile) {
      return res.status(404).json({
        error: "Profile not found."
      });
    }

    if (!profile.stripe_customer_id) {
      return res.status(400).json({
        error:
          "No Stripe customer ID found for this user. Make a fresh subscription after the webhook is deployed."
      });
    }

    const origin = req.headers.origin || "https://taskcoastal.com";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/c/`
    });

    return res.status(200).json({
      url: portalSession.url
    });
  } catch (error) {
    console.error("Create portal session error:", error);

    return res.status(500).json({
      error: error.message || "Something went wrong."
    });
  }
};
