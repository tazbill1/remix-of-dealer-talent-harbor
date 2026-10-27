import { createFileRoute, Link } from "@tanstack/react-router";
import { COMPANY, LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions | hireme by WerkandMe" },
      {
        name: "description",
        content: "Terms for job applicants using hireme by WerkandMe, including SMS terms.",
      },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage title="Terms & Conditions">
      <p>
        These terms apply to job applicants who use {COMPANY.program}, a hiring platform operated by{" "}
        {COMPANY.legal} on behalf of the automotive dealerships that post jobs on it. By submitting
        an application you agree to these terms and our{" "}
        <Link to="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>

      <h2>Applications</h2>
      <p>
        Hiring decisions are made by the dealership you applied to, not by WerkandMe. Please provide
        accurate information. You can ask us to remove your information at any time by emailing{" "}
        {COMPANY.email}.
      </p>

      <h2>SMS Terms</h2>
      <ul>
        <li>
          <strong>Program:</strong> {COMPANY.program} hiring texts, sent on behalf of the dealership
          you applied to.
        </li>
        <li>
          <strong>What you'll receive:</strong> messages about your application: a welcome,
          screening questions, status updates, and interview scheduling and reminders. Hiring
          managers enrolled by their dealership receive applicant summaries, interview reminders and
          new-hire check-ins.
        </li>
        <li>
          <strong>How you opt in:</strong> by checking the optional texting box on the job
          application. Agreeing is not a condition of applying.
        </li>
        <li>
          <strong>Frequency:</strong> message frequency varies with your application, typically a
          few messages per week while it is active.
        </li>
        <li>
          <strong>Cost:</strong> message and data rates may apply.
        </li>
        <li>
          <strong>Opt out:</strong> reply STOP at any time to stop all texts. You'll receive one
          confirmation message. Reply START to opt back in.
        </li>
        <li>
          <strong>Help:</strong> reply HELP, or email {COMPANY.email}.
        </li>
        <li>
          Carriers are not liable for delayed or undelivered messages. Texts are sent only between
          8am and 6pm local time.
        </li>
        <li>
          We do not sell or share your SMS opt-in data or personal information with third parties
          for marketing purposes.
        </li>
      </ul>

      <h2>Email</h2>
      <p>
        We may email you about your application and related openings. Every email includes an
        unsubscribe link.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms. The date at the top shows the latest version.</p>
    </LegalPage>
  );
}
