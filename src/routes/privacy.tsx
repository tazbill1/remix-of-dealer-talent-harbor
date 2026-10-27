import { createFileRoute, Link } from "@tanstack/react-router";
import { COMPANY, LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | hireme by WerkandMe" },
      {
        name: "description",
        content:
          "How hireme by WerkandMe collects and uses applicant information, including text messaging.",
      },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        {COMPANY.program} is a hiring platform operated by {COMPANY.legal} ("WerkandMe", "we",
        "us"). Automotive dealerships use it to post jobs, receive applications and communicate with
        applicants. This policy explains what we collect when you apply for a job through hireme and
        how we use it.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          What you give us when you apply: name, email, mobile phone number, resume and work
          history.
        </li>
        <li>
          Your answers to screening questions and the messages you exchange with us by text or
          email.
        </li>
        <li>
          Your texting choice: whether you agreed to receive texts, and any STOP or START replies.
        </li>
        <li>Basic technical information such as the job posting you came from.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>
          To process your application for the dealership you applied to and share it with their
          hiring team.
        </li>
        <li>
          To send you updates, screening questions and interview reminders by email, and by text if
          you agreed.
        </li>
        <li>To schedule interviews and keep a record of communication on your application.</li>
        <li>To operate, secure and improve the platform.</li>
      </ul>

      <h2>Text messaging (SMS)</h2>
      <p>
        If you check the texting box on an application, we will text you about that application at
        the number you provided. Message frequency varies. Message and data rates may apply. Reply
        STOP to opt out at any time, or HELP for help. Agreeing to texts is not required to apply.
      </p>
      <p>
        <strong>
          We do not sell or share your SMS opt-in data or personal information with third parties
          for marketing purposes.
        </strong>{" "}
        Mobile numbers and texting consent are used only to send the messages described above and
        are never sold, rented or shared for anyone's marketing.
      </p>

      <h2>Who we share information with</h2>
      <ul>
        <li>
          The dealership (and its dealer group) you applied to, so they can consider your
          application.
        </li>
        <li>
          Service providers that help us run the platform (for example hosting, text message and
          email delivery), only as needed to provide the service and under confidentiality
          obligations.
        </li>
        <li>When required by law.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>Texts: reply STOP to any message. Reply START to opt back in.</li>
        <li>Emails: use the unsubscribe link in any email.</li>
        <li>To ask about or remove your information, email {COMPANY.email}.</li>
      </ul>

      <h2>Security and retention</h2>
      <p>
        We use reasonable safeguards to protect your information and keep it only as long as needed
        for hiring purposes or as required by law.
      </p>

      <p>
        See also our{" "}
        <Link to="/terms" className="underline">
          Terms &amp; Conditions
        </Link>
        .
      </p>
    </LegalPage>
  );
}
