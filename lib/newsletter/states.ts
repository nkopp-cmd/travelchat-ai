/** Static result pages under /newsletter/<state> (edge-cached, no data). */
export const NEWSLETTER_STATES = {
  thanks: {
    title: "Check your inbox",
    lede: "We sent you a link. Open it within 24 hours to confirm your sign-up. No email? Look in spam, or try again tomorrow.",
  },
  confirmed: {
    title: "You are on the list",
    lede: "Thanks for confirming. The next Localley newsletter comes to your inbox. Every issue has a one-click unsubscribe link.",
  },
  unsubscribed: {
    title: "You are unsubscribed",
    lede: "We will not send you the Localley newsletter again. Changed your mind? Sign up again on this page at any time.",
  },
  invalid: {
    title: "This link does not work",
    lede: "The link is old or incomplete. Confirmation links work for 24 hours. Sign up again to get a new one.",
  },
  "check-email": {
    title: "Check the email address",
    lede: "That address does not look complete. Enter it again, for example name@example.com.",
  },
  retry: {
    title: "Please try again in a minute",
    lede: "Too many sign-ups came from your connection just now. Wait a minute and send the form again.",
  },
} as const;

export type NewsletterState = keyof typeof NEWSLETTER_STATES;
