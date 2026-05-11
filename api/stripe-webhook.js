const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

async function getRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks);
}

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({
      error: "Missing STRIPE_SECRET_KEY"
    });
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({
      error: "Missing STRIPE_WEBHOOK_SECRET"
    });
  }

  if (!process.env.SUPABASE_URL) {
    return res.status(500).json({
      error: "Missing SUPABASE_URL"
    });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      error: "Missing SUPABASE_SERVICE_ROLE_KEY"
    });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const signature = req.headers["stripe-signature"];

  let event;

  try {
    const rawBody = await getRawBody(req);

    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error("Webhook signature verification failed:", error.message);

    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const userId = session.metadata?.user_id;
      const email = session.metadata?.email || session.customer_details?.email || null;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      if (!userId) {
        console.error("Missing user_id metadata in checkout session.");

        return res.status(400).json({
          error: "Missing user_id metadata"
        });
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

        return res.status(500).json({
          error: "Failed to upgrade user to Pro"
        });
      }

      console.log("User upgraded to Pro:", userId);
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;

      const isActive =
        subscription.status === "active" ||
        subscription.status === "trialing";

      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          is_pro: isActive,
          stripe_subscription_id: subscription.id
        })
        .eq("stripe_subscription_id", subscription.id);

      if (error) {
        console.error("Supabase subscription update error:", error);

        return res.status(500).json({
          error: "Failed to update subscription status"
        });
      }

      console.log("Subscription updated:", subscription.id, subscription.status);
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;

      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          is_pro: false,
          stripe_subscription_id: null
        })
        .eq("stripe_subscription_id", subscription.id);

      if (error) {
        console.error("Supabase subscription deleted error:", error);

        return res.status(500).json({
          error: "Failed to remove Pro status"
        });
      }

      console.log("Subscription deleted. Pro disabled:", subscription.id);
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;

      if (subscriptionId) {
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            is_pro: false
          })
          .eq("stripe_subscription_id", subscriptionId);

        if (error) {
          console.error("Supabase payment failed update error:", error);

          return res.status(500).json({
            error: "Failed to handle failed payment"
          });
        }

        console.log("Payment failed. Pro disabled:", subscriptionId);
      }
    }

    return res.status(200).json({
      received: true
    });
  } catch (error) {
    console.error("Webhook handler crash:", error);

    return res.status(500).json({
      error: "Webhook handler failed"
    });
  }
}

module.exports = handler;

module.exports.config = {
  api: {
    bodyParser: false
  }
};
