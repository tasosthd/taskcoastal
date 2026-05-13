const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: "Method not allowed. Use POST."
      })
    };
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Missing STRIPE_SECRET_KEY."
        })
      };
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Missing Supabase environment variables."
        })
      };
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const body = JSON.parse(event.body || "{}");

    const { userId } = body;

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing userId."
        })
      };
    }

    /*
      IMPORTANT:
      Your profiles/users table needs to store the Stripe customer ID.
      Example column:
      stripe_customer_id
    */

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: "User profile not found."
        })
      };
    }

    if (!profile.stripe_customer_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "No Stripe customer found for this user."
        })
      };
    }

    const origin =
      event.headers.origin ||
      "https://taskcoastal.com";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/`
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: portalSession.url
      })
    };
  } catch (error) {
    console.error("Create portal session error:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: error.message || "Something went wrong."
      })
    };
  }
};
