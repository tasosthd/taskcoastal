const Stripe = require("stripe");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { email, userId } = req.body || {};

    if (!email || !userId) {
      return res.status(400).json({
        error: "Missing email or userId"
      });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        error: "Missing STRIPE_SECRET_KEY"
      });
    }

    if (!process.env.STRIPE_PRICE_ID) {
      return res.status(500).json({
        error: "Missing STRIPE_PRICE_ID"
      });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const origin = req.headers.origin || "https://taskcoastal.com";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],

      mode: "subscription",

      customer_email: email,

      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1
        }
      ],

      metadata: {
        user_id: userId,
        email: email
      },

      subscription_data: {
        metadata: {
          user_id: userId,
          email: email
        }
      },

      success_url: `${origin}?checkout=success`,
      cancel_url: `${origin}?checkout=cancelled`
    });

    return res.status(200).json({
      url: session.url
    });
  } catch (error) {
    console.error("Stripe checkout error:", error);

    return res.status(500).json({
      error: error.message || "Stripe checkout failed"
    });
  }
};
