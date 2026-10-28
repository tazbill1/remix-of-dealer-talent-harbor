import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

const title = "How we use AI | hireme by WerkandMe";
const description =
  "What the hireme AI assistant does and doesn't do when you apply for a job, and how to reach a person.";

export const Route = createFileRoute("/ai-notice")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiNotice,
});

function AiNotice() {
  return (
    <LegalPage title="How we use AI">
      <p>
        Employers that use hireme have an AI assistant that helps with parts of the hiring process. Here is
        what it does, what it doesn't do, and how to reach a person.
      </p>

      <h2>What the AI does</h2>
      <ul>
        <li>Asks screening questions about the job, like your experience and availability.</li>
        <li>Answers common questions and helps schedule interviews.</li>
        <li>Sends reminders about interviews and next steps.</li>
        <li>Suggests short summaries of applications for the hiring team to read.</li>
      </ul>

      <h2>What the AI does not do</h2>
      <ul>
        <li>It never makes hire or reject decisions.</li>
        <li>It doesn't use facial analysis or voice analysis.</li>
      </ul>

      <h2>A person makes the final decision</h2>
      <p>
        A person on the hiring team reviews applicants and makes every hiring decision.
      </p>

      <h2>Talking with a person or asking about your information</h2>
      <p>
        You can ask to talk with a person at any time. Reply HUMAN to any text from us, or email the store
        you applied to. You can also ask the store for a copy of the information you shared.
      </p>

      <h2>Your data</h2>
      <p>
        Your information is handled as described in our <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </LegalPage>
  );
}
