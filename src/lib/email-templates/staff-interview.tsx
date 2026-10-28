import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  applicant?: string;
  job?: string;
  store?: string;
  when?: string;
  minutes?: number;
  location?: string;
  calendarUrl?: string;
  appUrl?: string;
  moved?: boolean;
}

function StaffInterview({ applicant = "Applicant", job = "Interview", store = "Your store", when = "", minutes = 30, location = "", calendarUrl, appUrl, moved = false }: Props) {
  return <Html lang="en"><Head /><Preview>{moved ? "Interview moved" : "Interview booked"}: {applicant} · {when}</Preview>
    <Body style={{ backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif", color: "#1d224b" }}>
      <Container style={{ padding: "24px", maxWidth: "560px" }}>
        <Text>hireme by WerkandMe</Text><Heading>{moved ? "Interview moved" : "Interview booked"}</Heading>
        <Text>{applicant}<br />{job} · {store}</Text>
        <Text>{when}<br />{minutes} minutes<br />{location}</Text>
        {moved && <Text>Remove the previous time from your calendar, then add this updated time.</Text>}
        {calendarUrl && <Button href={calendarUrl} style={{ backgroundColor: "#1d224b", color: "#ffffff", padding: "12px 18px", borderRadius: "4px" }}>Add to calendar</Button>}
        <Text>Open the downloaded calendar file in Google Calendar or Outlook to add the interview. It does not update your calendar automatically.</Text>
        {appUrl && <Text><a href={`${appUrl}/calendar`}>View interview in hireme</a></Text>}
      </Container>
    </Body></Html>;
}

export const template = {
  component: StaffInterview,
  subject: (data) => `${data['moved'] ? "Interview moved" : "Interview booked"}: ${data['applicant'] ?? "Applicant"}`,
  displayName: "Staff interview invite",
  previewData: { applicant: "Sample Applicant", job: "Service advisor", store: "Sample Store", when: "Wednesday, October 28 at 10:00 AM CDT", minutes: 30 },
} satisfies TemplateEntry;