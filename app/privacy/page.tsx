import type { Metadata } from "next";
import { LegalDoc, type LegalSection } from "@/components/LegalDoc";

export const metadata: Metadata = {
  title: "Privacy Policy | Table & Bell",
  description: "How Table & Bell collects, uses and protects the information of restaurant guests, staff and owners.",
  alternates: { canonical: "/privacy" },
};

const sections: LegalSection[] = [
  {
    h: "Who we are and our role",
    p: [
      "Table & Bell (tableandbell.com) is software that restaurants use to run a digital waiting list, take orders at the table, and manage service.",
      "For information about guests, the restaurant you are visiting decides why and how it is used, and Table & Bell processes it on the restaurant's behalf. For information about restaurant owners and staff accounts, Table & Bell is responsible for it.",
    ],
  },
  {
    h: "Information we collect from guests",
    list: [
      "Waiting list: the name you type, party size, seating preference, language and, only if you choose to give it, a phone number.",
      "At the table: what you order, service requests (for example water or the bill), the tip and payment method you choose, and any rating or comment you leave.",
      "Loyalty, if the restaurant runs it and you choose to join: your mobile number and the stamps or points you collect.",
      "Trivia: the nickname you choose for the game.",
      "Technical: a cookie that remembers your ticket or table on your phone, your language choice, and your IP address, which we use only in a scrambled (hashed) form to stop abuse such as fake queue entries.",
    ],
    p: ["We never ask guests for card numbers or bank details. Table & Bell records how you said you would pay; the restaurant's own card machine or cash desk takes the money."],
  },
  {
    h: "Information we collect from restaurants",
    list: [
      "Owner and staff accounts: name, email address or mobile number, role, and a password. Passwords are stored only in a protected, one-way form by our login provider; we cannot see them.",
      "Restaurant details: name, logo, menu, tables, seating sections, contact details, and the legal details the owner enters.",
      "An activity log of important actions (for example who marked a bill paid or changed a price), so the owner can see who did what.",
      "Billing: plan, subscription status and invoices. Card payments for subscriptions are handled by our payment provider, Safepay; we do not receive or store card numbers.",
    ],
  },
  {
    h: "How we use information",
    list: [
      "To run the service: add you to the queue, tell you when your table is ready, send orders to the kitchen, and prepare the bill.",
      "To give restaurants reports about their own service, such as waiting times and popular dishes.",
      "To keep the service secure: prevent password guessing, fake sign-ups and queue flooding.",
      "To provide support, send important account and billing emails, and meet legal and tax duties.",
    ],
    p: ["We do not sell personal information, and we do not use it for advertising."],
  },
  {
    h: "Cookies",
    p: [
      "We use only cookies needed for the service to work: the staff login (protected so page scripts cannot read it), your language choice, and cookies that remember your ticket, table or kitchen display on that device.",
      "We measure overall site visits and page speed with Vercel Web Analytics and Speed Insights, which do not use cookies and do not identify you.",
    ],
  },
  {
    h: "Who we share information with",
    p: [
      "Guest information is shown only to the staff of the restaurant you visit. Each restaurant's information is kept separate from every other restaurant.",
      "We use trusted service providers to run Table & Bell: Supabase (database and login), Vercel (hosting), Resend (system emails), Zoho (company email) and Safepay (subscription payments). They may process information only to provide their service to us and must protect it.",
      "Our providers keep data in secure, professionally run data centres. Details of where data is stored are available on request.",
      "We may disclose information if the law requires it, or to protect the safety of people or the security of the service.",
    ],
  },
  {
    h: "How long we keep information",
    list: [
      "Guest phone numbers on the waiting list are deleted automatically 30 days after the visit.",
      "Guest names on the waiting list are replaced with \"Guest\" automatically 180 days after the visit. Anonymous numbers (such as party size and waiting time) stay in the restaurant's reports.",
      "Loyalty members are kept while the restaurant runs its loyalty programme, or until the guest asks for removal.",
      "Owner and staff account information is kept while the account is active and deleted within 90 days after the restaurant closes its account, except invoices and records we must keep for tax and legal reasons.",
      "Security records used to stop abuse are kept for no more than one day.",
    ],
  },
  {
    h: "Your rights",
    p: [
      "You can ask to see, correct or delete your personal information, or object to how it is used, in line with the data protection laws that apply to you, including Saudi Arabia's Personal Data Protection Law and the laws of Pakistan.",
      "Guests can ask the restaurant directly, or write to us and we will pass the request to the restaurant. Owners and staff can write to us. We reply within 30 days.",
    ],
  },
  {
    h: "Security",
    p: [
      "All connections to Table & Bell are encrypted. Access to data goes through our own server, which checks every request, and staff see only what their role allows.",
      "No system is perfectly secure. If we learn of a breach that affects your information, we will tell the affected restaurants and, where the law requires, the people affected and the authorities.",
    ],
  },
  {
    h: "Children",
    p: ["Table & Bell is meant to be used by adults. Children may visit a restaurant with their family, but the waiting list should be joined by an adult."],
  },
  {
    h: "Changes to this policy",
    p: ["If we make important changes, we will update the date at the top of this page and, for restaurants, tell the account owner by email."],
  },
  {
    h: "Contact",
    p: ["For privacy questions or requests, email support@tableandbell.com. For security reports, email support@tableandbell.com with the subject \"Security\"."],
  },
];

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy Policy"
      updated="28 November 2026"
      intro="This policy explains what information Table & Bell collects when guests use a restaurant's QR waiting list or table ordering, and when restaurant owners and staff use their account; how we use and protect it; and the choices you have."
      sections={sections}
    />
  );
}
