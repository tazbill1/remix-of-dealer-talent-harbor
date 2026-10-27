import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { GradientText } from "@/components/brand";

export type Step = { title: string; text: string };
export type Faq = { q: string; a: string };

export const groupJourney: Step[] = [
  { title: "Quick mobile apply", text: "Candidates apply in under two minutes from Indeed, Google Jobs or your site. No account needed." },
  { title: "Instant AI welcome", text: "The store's HR assistant says hi right away, asks job-specific questions and shares a welcome video." },
  { title: "No ghosting", text: "Applicants get a live status page and friendly check-ins. Managers get nudged when reviews run late." },
  { title: "Smarter interviews", text: "Tailored questions from the resume and chats. Interviews are recorded, transcribed and graded." },
  { title: "Offer or share", text: "Hire with a clean handoff, or flag great people as open to your other stores. Never outside your group." },
  { title: "30 / 60 / 90 days", text: "Automatic check-ins with new hires and managers spot turnover risk early." },
];

export const candidateJourney: Step[] = [
  { title: "Quick apply", text: "Pick your store and role, then apply from your phone in minutes." },
  { title: "Meet your assistant", text: "Get a friendly hello, a few quick questions and a video from the team." },
  { title: "Always in the loop", text: "Check your status anytime with your private link. We'll keep you updated." },
  { title: "Your interview", text: "A relaxed conversation about your goals, experience and fit." },
  { title: "Find your fit", text: "Not the right match here? We can connect you with our sister stores." },
  { title: "Your first 90 days", text: "We check in at 30, 60 and 90 days to make sure you're set up to succeed." },
];

export const groupFaqs: Faq[] = [
  { q: "How is our data kept separate from other dealer groups?", a: "Every dealer group is fully private. Your stores can share applicants with each other, but nothing ever crosses to another group." },
  { q: "Can store managers post jobs, or does HR approve?", a: "Managers can request jobs with department and replacement or growth details. Only recruiters and HR admins publish them." },
  { q: "How do jobs get to Indeed and other job sites?", a: "Every open job goes into a live feed that Indeed, ZipRecruiter and Google Jobs pick up. You manage sponsored budgets in Indeed." },
  { q: "Will the AI assistant mix up applicants?", a: "No. Each store has its own assistant, and every conversation is tied to one applicant only." },
  { q: "Does it work for 5 stores and for 50?", a: "Yes. Add as many stores as you have, and see the whole group or one store at a time." },
];

export const candidateFaqs: Faq[] = [
  { q: "What happens after I apply?", a: "You'll get a confirmation and a private link to check your status anytime. Our assistant will reach out with a few quick questions." },
  { q: "Can I be considered at more than one location?", a: "Yes. Let us know you're open to other stores and our sister dealerships can reach out." },
  { q: "How long does hiring take?", a: "Managers usually review within 1 to 3 days. We'll keep you updated, even while we're still reviewing." },
  { q: "Who do I contact with questions?", a: "Just reply to your assistant's messages, or check your status page for store contact details." },
];

export function Journey({ title, accent, steps }: { title: string; accent: string; steps: Step[] }) {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16">
      <h2 className="text-3xl md:text-4xl">{title} <GradientText>{accent}</GradientText></h2>
      <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="rounded-2xl border bg-card p-6">
            <span className="flex size-9 items-center justify-center rounded-full bg-sapphire text-sm font-bold text-primary-foreground">{i + 1}</span>
            <h3 className="mt-4 text-lg">{s.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <section className="mx-auto max-w-3xl px-5 py-16">
      <h2 className="text-3xl md:text-4xl">Questions? <GradientText>Answers.</GradientText></h2>
      <Accordion type="single" collapsible className="mt-8 rounded-2xl border bg-card px-5">
        {faqs.map((f) => (
          <AccordionItem key={f.q} value={f.q}>
            <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
