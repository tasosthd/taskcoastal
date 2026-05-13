const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

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

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: "Missing STRIPE_WEBHOOK_SECRET"
      })
    };
  }

  if (!process.env.SUPABASE_URL) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: "Missing SUPABASE_URL"
      })
    };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: "Missing SUPABASE_SERVICE_ROLE_KEY"
      })
    };
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );

  const signature =
    event.headers["stripe-signature"] ||
    event.headers["Stripe-Signature"];

  let stripeEvent;

  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : event.body;

    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error("Webhook signature verification failed:", error.message);

    return {
      statusCode: 400,
      headers: {
        "Content-Type": "text/plain"
      },
      body: `Webhook Error: ${error.message}`
    };
  }

  try {
    if (stripeEvent.type === "checkout.session.completed") {
      const session = stripeEvent.data.object;

      const userId = session.metadata?.user_id;
      const email =
        session.metadata?.email ||
        session.customer_details?.email ||
        session.customer_email ||
        null;

      const customerId = session.customer || null;
      const subscriptionId = session.subscription || null;

      if (!userId) {
        console.error("Missing user_id metadata in checkout session.");

        return {
          statusCode: 400,
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            error: "Missing user_id metadata"
          })
        };
      }

      const { error } = await supabaseAdmin
        .from("profiles")
        .upsert(
          {
            id: userId,
            email: email,
            is_pro: true,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId
          },
          {
            onConflict: "id"
          }
        );

      if (error) {
        console.error("Supabase Pro upgrade error:", error);

        return {
          statusCode: 500,
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            error: "Failed to upgrade user to Pro"
          })
        };
      }

      console.log("User upgraded to Pro:", userId);
    }

    if (stripeEvent.type === "customer.subscription.created") {
      const subscription = stripeEvent.data.object;

      const userId = subscription.metadata?.user_id || null;
      const email = subscription.metadata?.email || null;

      const isActive =
        subscription.status === "active" ||
        subscription.status === "trialing";

      if (userId) {
        const { error } = await supabaseAdmin
          .from("profiles")
          .upsert(
            {
              id: userId,
              email: email,
              is_pro: isActive,
              stripe_customer_id: subscription.customer || null,
              stripe_subscription_id: subscription.id
            },
            {
              onConflict: "id"
            }
          );

        if (error) {
          console.error("Supabase subscription created error:", error);

          return {
            statusCode: 500,
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              error: "Failed to handle subscription created"
            })
          };
        }
      }

      console.log("Subscription created:", subscription.id, subscription.status);
    }

    if (stripeEvent.type === "customer.subscription.updated") {
      const subscription = stripeEvent.data.object;

      const isActive =
        subscription.status === "active" ||
        subscription.status === "trialing";

      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          is_pro: isActive,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: subscription.customer || null
        })
        .eq("stripe_subscription_id", subscription.id);

      if (error) {
        console.error("Supabase subscription update error:", error);

        return {
          statusCode: 500,
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            error: "Failed to update subscription status"
          })
        };
      }

      console.log("Subscription updated:", subscription.id, subscription.status);
    }

    if (stripeEvent.type === "customer.subscription.deleted") {
      const subscription = stripeEvent.data.object;

      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          is_pro: false,
          stripe_subscription_id: null
        })
        .eq("stripe_subscription_id", subscription.id);

      if (error) {
        console.error("Supabase subscription deleted error:", error);

        return {
          statusCode: 500,
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            error: "Failed to remove Pro status"
          })
        };
      }

      console.log("Subscription deleted. Pro disabled:", subscription.id);
    }

    if (stripeEvent.type === "invoice.payment_succeeded") {
      const invoice = stripeEvent.data.object;
      const subscriptionId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;

      if (subscriptionId) {
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            is_pro: true
          })
          .eq("stripe_subscription_id", subscriptionId);

        if (error) {
          console.error("Supabase payment succeeded update error:", error);

          return {
            statusCode: 500,
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              error: "Failed to handle successful payment"
            })
          };
        }

        console.log("Payment succeeded. Pro active:", subscriptionId);
      }
    }

    if (stripeEvent.type === "invoice.payment_failed") {
      const invoice = stripeEvent.data.object;
      const subscriptionId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;

      if (subscriptionId) {
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            is_pro: false
          })
          .eq("stripe_subscription_id", subscriptionId);

        if (error) {
          console.error("Supabase payment failed update error:", error);

          return {
            statusCode: 500,
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              error: "Failed to handle failed payment"
            })
          };
        }

        console.log("Payment failed. Pro disabled:", subscriptionId);
      }
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        received: true
      })
    };
  } catch (error) {
    console.error("Webhook handler crash:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: "Webhook handler failed"
      })
    };
  }
};
