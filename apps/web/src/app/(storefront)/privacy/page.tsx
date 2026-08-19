import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | KuttyStory",
  description:
    "How KuttyStory collects, uses and protects your data - including the photos you upload to personalize a storybook.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="19 August 2026"
      intro="KuttyStory turns a photo of your child into an illustrated storybook. That means we handle personal data - including a child's image - and we treat it accordingly. This page explains what we collect, why, and how long we keep it."
    >
      <LegalSection title="What we collect">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Personalization details</strong> - your child&apos;s first
            name, age, gender and chosen language, used to write and illustrate
            the book.
          </li>
          <li>
            <strong>Photographs</strong> - the images you upload so we can
            illustrate your child&apos;s likeness into the artwork.
          </li>
          <li>
            <strong>Order and delivery details</strong> - your name, email,
            phone number and shipping address, needed to fulfil printed orders.
          </li>
          <li>
            <strong>Usage data</strong> - standard analytics about how the site
            is used, collected via Google Tag Manager.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="How we use photographs">
        <p>
          Uploaded photos are used for one purpose only: generating the
          illustrations in your book. We do not sell them, share them with
          advertisers, or use them to market to you.
        </p>
        <p>
          Photos are deleted from our systems once your order is complete and the
          reprint window has closed. If you want them removed sooner, email us
          and we will delete them within 7 days.
        </p>
      </LegalSection>

      <LegalSection title="Payments">
        <p>
          Payments are processed by Razorpay. Your card and banking details are
          entered directly with Razorpay and never reach or get stored on
          KuttyStory servers. We retain only the payment reference and status
          needed to service your order.
        </p>
      </LegalSection>

      <LegalSection title="Children's data">
        <p>
          KuttyStory is purchased by adults on behalf of a child. By uploading a
          photo you confirm you are the child&apos;s parent or legal guardian, or
          have their guardian&apos;s permission. We do not knowingly collect data
          directly from children.
        </p>
      </LegalSection>

      <LegalSection title="Who we share data with">
        <p>
          We share the minimum necessary with the services that make an order
          possible: our payment processor (Razorpay), our print and delivery
          partners, and our hosting and analytics providers. We do not sell
          personal data.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          You can ask us to show you the data we hold about you, correct it, or
          delete it. Write to{" "}
          <a
            href="mailto:hello@kuttystory.co.in"
            className="font-semibold text-brand-primary hover:underline"
          >
            hello@kuttystory.co.in
          </a>{" "}
          and we will respond within 30 days.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
