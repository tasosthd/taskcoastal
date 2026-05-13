const Stripe = require("stripe");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: "Method not allowed"
      })
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { email, userId } = body;

    if (!email || !userId) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          error: "Missing email or userId"
        })
      };
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          error: "Missing STRIPE_SECRET_KEY"
        })
      };
    }

    if (!process.env.STRIPE_PRICE_ID) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          error: "Missing STRIPE_PRICE_ID"
        })
      };
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const siteUrl =
      process.env.SITE_URL ||
      event.headers.origin ||
      "https://astonishing-gumdrop-55113b.netlify.app";

    const cleanSiteUrl = siteUrl.replace(/\/$/, "");

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

      success_url: `${cleanSiteUrl}/c/?checkout=success`,
      cancel_url: `${cleanSiteUrl}/c/?checkout=cancelled`
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: session.url
      })
    };
  } catch (error) {
    console.error("Stripe checkout error:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: error.message || "Stripe checkout failed"
      })
    };
  }
};
