// stripe.js – les paiements de Buddy Premium (abonnement mensuel), avec Stripe.
// La clé secrète Stripe (STRIPE_SECRET_KEY) reste ICI, sur le serveur, jamais dans la page web.
// Sans clé dans .env (ou sur Vercel) : les paiements sont simplement éteints, l'app marche comme avant.
//
// Comment ça marche :
//   1. La personne clique "Essayer 7 jours gratuitement" → on lui ouvre la page de paiement de Stripe (Checkout).
//   2. Elle revient sur Buddy → on demande à Stripe où en est son abonnement, et on le note dans son profil.
//   3. "Gérer mon abonnement" (Paramètres) → la page Stripe pour changer de carte, voir ses factures ou annuler.
// On redemande à Stripe l'état de l'abonnement de temps en temps (au plus toutes les 6 h, et à chaque retour de Stripe).

import Stripe from "stripe";

export const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
export const paymentsReady = Boolean(stripe);

export const TRIAL_DAYS = 7;
const PRODUCT_NAME = "buddy premium"; // le nom du produit dans Stripe (majuscules sans importance)
const SYNC_EVERY = 6 * 3600 * 1000;   // on redemande l'état de l'abonnement à Stripe au plus toutes les 6 h

// Le prix de Buddy Premium : trouvé tout seul dans Stripe (le produit "Buddy Premium", mensuel).
// STRIPE_PRICE_ID dans .env permet d'en forcer un autre si besoin.
let priceId = process.env.STRIPE_PRICE_ID || null;
async function premiumPrice() {
  if (priceId) return priceId;
  const prices = await stripe.prices.list({ active: true, type: "recurring", expand: ["data.product"], limit: 100 });
  const price = prices.data.find((p) => p.product?.active && String(p.product.name).trim().toLowerCase() === PRODUCT_NAME);
  if (!price) throw new Error(`Aucun prix mensuel trouvé pour le produit "Buddy Premium" dans Stripe.`);
  return (priceId = price.id);
}

// La page de Stripe pour gérer son abonnement doit être réglée une fois : on le fait tout seul si besoin.
let portalReady = false;
async function ensurePortal(appUrl) {
  if (portalReady) return;
  const existing = await stripe.billingPortal.configurations.list({ limit: 1, active: true });
  if (!existing.data.length) {
    await stripe.billingPortal.configurations.create({
      business_profile: {
        headline: "Buddy Premium",
        privacy_policy_url: appUrl + "/legal/confidentialite.html",
        terms_of_service_url: appUrl + "/legal/conditions.html",
      },
      features: {
        subscription_cancel: { enabled: true, mode: "at_period_end" }, // annuler = Premium jusqu'à la fin du mois payé
        payment_method_update: { enabled: true },
        invoice_history: { enabled: true },
        customer_update: { enabled: true, allowed_updates: ["email", "address"] },
      },
    });
    console.log("💳 Page « Gérer mon abonnement » réglée dans Stripe.");
  }
  portalReady = true;
}

// Le "client" Stripe de la personne (créé une seule fois, puis rangé dans son profil)
async function customerFor(user, profile, saveProfile) {
  if (profile?.stripe_customer_id) return profile.stripe_customer_id;
  const customer = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
  await saveProfile(user.id, { stripe_customer_id: customer.id });
  return customer.id;
}

// 1. La page de paiement (avec 7 jours offerts si la personne n'a jamais été abonnée)
export async function createCheckout({ user, profile, saveProfile, appUrl, lang }) {
  const customer = await customerFor(user, profile, saveProfile);
  const past = await stripe.subscriptions.list({ customer, status: "all", limit: 1 });
  const trial = past.data.length === 0; // un seul essai gratuit par personne
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price: await premiumPrice(), quantity: 1 }],
    subscription_data: { ...(trial ? { trial_period_days: TRIAL_DAYS } : {}), metadata: { user_id: user.id } },
    allow_promotion_codes: true,
    locale: lang === "en" ? "en" : "fr",
    success_url: appUrl + "/?checkout=success#accueil",
    cancel_url: appUrl + "/?checkout=cancel#accueil",
  });
  return session.url;
}

// 3. La page "Gérer mon abonnement"
export async function createPortal({ profile, appUrl }) {
  if (!profile?.stripe_customer_id) throw new Error("pas de client Stripe");
  await ensurePortal(appUrl);
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: appUrl + "/?portal=1#parametres",
  });
  return session.url;
}

// 2. Où en est l'abonnement ? → les colonnes à ranger dans le profil.
// "active" (payé), "trialing" (essai) et "past_due" (paiement en retard : Stripe réessaie) = Premium.
export async function subscriptionState(customer) {
  const subs = await stripe.subscriptions.list({ customer, status: "all", limit: 10 });
  const order = ["active", "trialing", "past_due"];
  const best = subs.data.filter((s) => order.includes(s.status)).sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))[0]
    || subs.data[0]; // sinon : le plus récent (annulé, impayé…), pour savoir que l'essai a déjà servi
  const date = (seconds) => (seconds ? new Date(seconds * 1000).toISOString() : null);
  // La fin de la période payée (rangée sur l'abonnement ou, dans les versions récentes de Stripe, sur sa ligne)
  const periodEnd = best?.current_period_end ?? best?.items?.data?.[0]?.current_period_end;
  return {
    plan: best && order.includes(best.status) ? "premium" : "free",
    subscription_status: best?.status || null,
    trial_ends_at: best?.status === "trialing" ? date(best.trial_end) : null,
    premium_until: date(best?.cancel_at || periodEnd),
    cancel_at_period_end: Boolean(best?.cancel_at_period_end || best?.cancel_at),
    stripe_synced_at: new Date().toISOString(),
  };
}

// Faut-il redemander à Stripe ? (au retour de Stripe, ou si la dernière fois date de plus de 6 h)
export function needsSync(profile, force) {
  if (!paymentsReady || !profile?.stripe_customer_id) return false;
  if (force) return true;
  const last = profile.stripe_synced_at ? new Date(profile.stripe_synced_at).getTime() : 0;
  return Date.now() - last > SYNC_EVERY;
}

// Suppression du compte : on arrête tout de suite l'abonnement (plus aucun prélèvement)
export async function cancelEverything(customer) {
  if (!paymentsReady || !customer) return;
  const subs = await stripe.subscriptions.list({ customer, status: "all", limit: 10 });
  for (const s of subs.data) {
    if (!["canceled", "incomplete_expired"].includes(s.status)) await stripe.subscriptions.cancel(s.id);
  }
}
