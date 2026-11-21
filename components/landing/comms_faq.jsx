import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@geiger/ui";
import { cn } from "@/lib/utils";
import { CONTAINER, HAIRLINE } from "@/components/landing/kit/area_kit";

// Plain answers about what Comms does today, including the channels that are still on the way.
const FAQS = [
  {
    question: "Which channels can customers use today?",
    answer:
      "The Messenger on your site is live today, and your replies can also go out by email. WhatsApp, SMS, social and Slack are on the way: you can save their settings now, but they don't send or receive messages yet.",
  },
  {
    question: "Can my whole team work the same inbox?",
    answer:
      "Yes. Conversations can be assigned, mentioned, snoozed, merged and handed off, and everyone sees the same live queue. Set yourself to Available, Away or Offline so the team knows who is in.",
  },
  {
    question: "Does AI answer customers on its own?",
    answer:
      "No. Copilot works for your team: it summarises threads, rewrites drafts and translates messages, and a teammate always decides what gets sent.",
  },
  {
    question: "Which AI provider does Copilot use?",
    answer:
      "The one you connect. Add a key for OpenAI, Anthropic, Gemini, OpenRouter, Mistral, Groq, Ollama or another supported provider. Your provider bills you directly, keys are encrypted in Supabase Vault, and each AI feature can be switched on separately with its own daily limit.",
  },
  {
    question: "Do you use my customer data for ads?",
    answer: "No. Your workspace content is not used for ad personalisation.",
  },
  {
    question: "Is Comms part of my Geiger account?",
    answer: "Yes. Comms uses the same sign-in, organisation and team as the other Geiger apps, so there's no new account to create.",
  },
];

export function CommsFaq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className={cn("border-t", HAIRLINE)}>
      <div className={cn(CONTAINER, "grid gap-10 py-24 sm:py-32 lg:grid-cols-2 lg:gap-0")}>
        <h2 id="faq-title" className="max-w-[12ch] text-[2.5rem] leading-[1.02] font-medium tracking-[-0.03em] text-balance sm:px-8 sm:text-5xl">
          Questions and answers
        </h2>
        <div className="sm:px-8">
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((faq, index) => (
              <AccordionItem key={faq.question} value={`faq-${index}`} className={HAIRLINE}>
                <AccordionTrigger className="text-left text-[15px] font-medium text-foreground hover:text-foreground hover:no-underline">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-[15px] leading-6 text-muted-foreground">{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
