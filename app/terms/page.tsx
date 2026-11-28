import type { Metadata } from "next";
import { LegalDoc, type LegalSection } from "@/components/LegalDoc";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that apply when a restaurant uses Table & Bell, and when guests use a restaurant's Table & Bell pages.",
  alternates: { canonical: "/terms" },
};

const sections: LegalSection[] = [
  {
    h: "About these terms",
    p: [
      "These terms apply to restaurants that create a Table & Bell account (\"you\") and to everyone who uses Table & Bell pages, including guests. By creating an account or using the service, you agree to them.",
      "The person who creates the account confirms they are allowed to accept these terms for the restaurant.",
    ],
  },
  {
    h: "The service",
    p: [
      "Table & Bell provides a digital waiting list, table ordering, a kitchen screen, staff tools, loyalty, trivia and reports. Features depend on the plan.",
      "Table & Bell does not take payments from guests. It records the payment method a guest chooses; the restaurant collects the money with its own card machine, cash desk or payment account.",
    ],
  },
  {
    h: "Accounts and security",
    list: [
      "Keep passwords private, give each staff member their own login, and choose the right role for each person.",
      "You are responsible for what happens under your restaurant's account. Tell us at once at support@tableandbell.com if you think someone has used it without permission.",
      "We may limit repeated failed logins and suspicious activity to protect accounts.",
    ],
  },
  {
    h: "Restaurant responsibilities",
    list: [
      "Keep menu items, prices, allergen information and opening details accurate. Guests rely on what you publish.",
      "Use guest information only to serve your guests and run your restaurant, and follow the data protection laws that apply to you.",
      "Do not use Table & Bell to send spam or misleading messages, or for anything unlawful.",
    ],
  },
  {
    h: "Acceptable use",
    list: [
      "Do not try to break, overload, or get around the security of the service, or access another restaurant's information.",
      "Do not add fake entries to a waiting list, send false service requests, or misuse another person's ticket or table link.",
      "We may block traffic or suspend access that puts the service or other users at risk.",
    ],
  },
  {
    h: "Plans, trials and billing",
    list: [
      "The Free plan has usage limits shown on the pricing page, including a monthly number of buzzer alerts and staff seats.",
      "New restaurants may receive a free Pro trial. When it ends, the account continues on the Free plan unless you subscribe.",
      "Paid plans are billed in advance each month through our payment provider. Prices are shown on the pricing page and may include or exclude taxes as stated there.",
      "You can cancel at any time. Cancellation takes effect at the end of the current paid month, and the account then moves to the Free plan. Fees already paid are not refunded unless the law requires it.",
      "We will give at least 30 days' notice by email before changing the price of an existing subscription.",
    ],
  },
  {
    h: "Your data",
    p: [
      "Your restaurant's information belongs to you. You allow us to store and process it only to provide and improve the service, as described in our Privacy Policy.",
      "You can ask us for a copy of your restaurant's data, or for deletion when you close your account.",
    ],
  },
  {
    h: "Availability and changes",
    p: [
      "We work to keep Table & Bell available and fast, but we cannot promise it will never be interrupted. Keep a simple backup way to manage your queue, such as calling out names.",
      "We may improve, change or remove features. If a change significantly reduces what a paid plan includes, we will tell you in advance.",
    ],
  },
  {
    h: "Our property",
    p: ["Table & Bell, its software, design and brand belong to us. You may use them only as part of the service. Your own logo, menu and photos remain yours."],
  },
  {
    h: "Ending the service",
    p: [
      "You can close your account at any time by contacting us. We may suspend or close an account that breaks these terms, after warning you where reasonable.",
    ],
  },
  {
    h: "Liability",
    p: [
      "The service is provided as it is. To the extent the law allows, we are not responsible for indirect losses such as lost profit, and our total responsibility for any claim is limited to the fees you paid us in the three months before the claim.",
      "Nothing in these terms limits rights that the law does not allow to be limited.",
    ],
  },
  {
    h: "Governing law",
    p: [
      "Table & Bell is owned and operated from Pakistan. These terms are governed by the laws of Pakistan, and the courts of Pakistan have jurisdiction over any dispute about them.",
      "If you are a consumer, this does not take away any protection you have under the laws of the country where you live.",
    ],
  },
  {
    h: "Changes to these terms",
    p: ["We may update these terms. We will change the date at the top of this page and tell account owners by email about important changes before they take effect."],
  },
  {
    h: "Contact",
    p: ["Questions about these terms: support@tableandbell.com. Billing questions: billing@tableandbell.com."],
  },
];

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms of Service"
      updated="28 November 2026"
      intro="These terms explain what Table & Bell provides, what we expect from restaurants and guests who use it, and how plans and billing work. Please read them together with our Privacy Policy."
      sections={sections}
    />
  );
}
