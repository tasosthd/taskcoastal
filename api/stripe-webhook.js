import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const config = {
  api: {
    bodyParser: false
  }
};

async function buffer(readable) {
  const chunks = [];

  for await (const chunk of readable) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sig = req.headers["stripe-signature"];

  let event;

  try {
    const rawBody = await buffer(req);

    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error("Webhook signature verification failed:", error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const userId = session.metadata?.userId;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      if (!userId) {
        console.error("No userId found in Stripe session metadata.");
        return res.status(400).json({ error: "Missing userId metadata" });
      }

      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          is_pro: true,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId
        })
        .eq("id", userId);

      if (error) {
        console.error("Supabase profile update error:", error);
        return res.status(500).json({ error: "Failed to update profile" });
      }

      console.log(`User upgraded to Pro: ${userId}`);
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
        console.error("Supabase subscription cancel error:", error);
        return res.status(500).json({ error: "Failed to cancel Pro" });
      }

      console.log(`Subscription canceled: ${subscription.id}`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return res.status(500).json({ error: "Webhook handler failed" });
  }
}
