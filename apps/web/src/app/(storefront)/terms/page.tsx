import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service | KuttyStory",
  description:
    "The terms that apply when you order a personalized storybook from KuttyStory - pricing, delivery, refunds and content rights.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="19 August 2026"
      intro="These terms apply when you use kuttystory.co.in or place an order with us. Please read them before buying."
    >
      <LegalSection title="What you are buying">
        <p>
          Each KuttyStory book is made to order: a professionally written story
          personalized with your child&apos;s name and illustrated with their
          likeness. You choose an instant PDF, a printed hardcover, or both.
        </p>
      </LegalSection>

      <LegalSection title="Previews and approval">
        <p>
          Previews are free and require no payment. You see and approve the book
          before you pay, and again before anything goes to print. Once you
          approve a book for printing, production begins and the order can no
          longer be changed.
        </p>
      </LegalSection>

      <LegalSection title="Pricing and payment">
        <p>
          All prices are listed in Indian Rupees and include applicable taxes.
          Payment is collected through Razorpay at checkout. We may change prices
          at any time, but never after an order is placed.
        </p>
      </LegalSection>

      <LegalSection title="Printing and delivery">
        <p>
          Printed hardcovers are produced within 2-3 business days and typically
          delivered across India within 4-7 days of the order. Delivery
          timelines are estimates, not guarantees, and can be affected by courier
          delays outside our control.
        </p>
      </LegalSection>

      <LegalSection title="Refunds and reprints">
        <p>
          Because every book is personalized, we cannot accept returns of
          correctly produced books. If a printed copy arrives damaged, misprinted
          or materially different from the preview you approved, contact us
          within 7 days of delivery with photographs and we will reprint or
          refund it.
        </p>
        <p>
          Digital PDFs are non-refundable once unlocked, since you approve the
          full preview beforehand.
        </p>
      </LegalSection>

      <LegalSection title="Photographs and content rights">
        <p>
          You keep all rights to the photographs you upload. By uploading, you
          grant KuttyStory a limited licence to use them solely to produce your
          book. You confirm you have the right to upload the photo and to have
          the pictured child illustrated.
        </p>
        <p>
          The story text, artwork and templates remain the intellectual property
          of KuttyStory. Your finished book is for personal, non-commercial use -
          you may not resell or mass-reproduce it.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>
          Do not upload photographs of people whose permission you do not have,
          or any content that is unlawful or offensive. We may refuse or cancel
          an order that breaches this, and refund it.
        </p>
      </LegalSection>

      <LegalSection title="Liability">
        <p>
          Our liability for any order is limited to the amount you paid for it.
          Nothing in these terms limits liability that cannot be limited under
          Indian law.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
