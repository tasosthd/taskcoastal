const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: "Method not allowed. Use POST."
      })
    };
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Missing STRIPE_SECRET_KEY in Netlify environment variables."
        })
      };
    }

    if (!process.env.SUPABASE_URL) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Missing SUPABASE_URL in Netlify environment variables."
        })
      };
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Missing SUPABASE_SERVICE_ROLE_KEY in Netlify environment variables."
        })
      };
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const body = JSON.parse(event.body || "{}");
    const userId = body.userId;

    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Missing userId."
        })
      };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: profileError.message
        })
      };
    }

    if (!profile) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: "Profile not found."
        })
      };
    }

    if (!profile.stripe_customer_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "No Stripe customer ID found for this user. Your webhook must save stripe_customer_id."
        })
      };
    }

    const origin =
      event.headers.origin ||
      "https://taskcoastal.com";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/c/`
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        url: portalSession.url
      })
    };
  } catch (error) {
    console.error("Create portal session error:", error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message || "Something went wrong."
      })
    };
  }
};
