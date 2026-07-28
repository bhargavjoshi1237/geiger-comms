import Link from "next/link";
import {
  ArrowRight,
  Inbox,
  MessagesSquare,
  Users,
  BookOpen,
  Bot,
  BarChart3,
} from "lucide-react";
import {
  Footer,
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@geiger/ui";
import { Header } from "@/components/header";
import CommsPlaygroundShowcase from "@/components/CommsPlaygroundShowcase";

const showcaseBackgroundImages = [
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-00a586c62c8782e65c0a.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/internal-brand-023-3291bb4c.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-0ec1f3ba625f482c9dc3.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-85923e7fafe00c9c0d1f.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-8e2e88cff7f33224ddd7.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-0a66efa21dd4b7e6c526.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-cc24ca462279ca23250c.jpg",
];

function pickRandomShowcaseBackground() {
  return showcaseBackgroundImages[Math.floor(Math.random() * showcaseBackgroundImages.length)];
}

export const metadata = {
  title: "Comms - Geiger Studio",
  description:
    "One shared inbox for every customer conversation — email, chat, and social. Reply faster, automate the routine, and keep your team aligned with Geiger Comms.",
};

const utilityCards = [
  {
    title: "Shared team inbox",
    description:
      "Every conversation in one queue with assignment, mentions, and internal notes — no dropped threads.",
    icon: Inbox,
  },
  {
    title: "Omnichannel messaging",
    description:
      "Email, live chat, Slack, WhatsApp, and Instagram unified into a single thread per customer.",
    icon: MessagesSquare,
  },
  {
    title: "Contacts & companies",
    description:
      "Rich profiles, segments, and history so you always know who you're talking to.",
    icon: Users,
  },
  {
    title: "Help Center",
    description:
      "Publish articles and collections that deflect tickets and let customers self-serve.",
    icon: BookOpen,
  },
  {
    title: "Automations & bots",
    description:
      "Route, snooze, and auto-reply with rules and AI so your team focuses on what matters.",
    icon: Bot,
  },
  {
    title: "Reports & SLAs",
    description:
      "Track response times, volume, and CSAT — and hold the line on your service targets.",
    icon: BarChart3,
  },
];

const faqs = [
  {
    value: "item-1",
    question: "How does Geiger Comms keep customer data secure?",
    answer:
      "Geiger Comms uses secure authentication, controlled access paths, and project-based visibility to keep your conversations private.",
  },
  {
    value: "item-2",
    question: "Do you use my customer data for ads?",
    answer: "No. Your workspace content is not used for ad personalization.",
  },
  {
    value: "item-3",
    question: "Can my whole team work the same inbox?",
    answer:
      "Yes. Conversations can be assigned, mentioned, and handed off, and everyone sees the same live queue.",
  },
  {
    value: "item-4",
    question: "Which channels does Geiger Comms support?",
    answer:
      "Email, live chat, Slack, WhatsApp, and Instagram today — each unified into a single thread per contact.",
  },
];

export default function CommsLandingPage() {
  const dashboardHref = "/org";
  const showcaseBg = pickRandomShowcaseBackground();

  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground selection:bg-indigo-500/30 font-sans">
      <div className="fixed inset-0 z-0 bg-[linear-gradient(to_right,#80808030_1px,transparent_1px),linear-gradient(to_bottom,#80808030_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      <Header dashboardHref={dashboardHref} />

      <main className="relative z-10 flex flex-1 flex-col pt-16 sm:pt-20">
        <section className="mx-auto mb-10 mt-10 flex w-full max-w-6xl items-start justify-start px-4 sm:mt-16 sm:px-6">
          <div className="max-w-3xl">
            <h1 className="mb-4 text-2xl font-semibold text-white sm:text-3xl">
              One shared inbox for every customer conversation.
            </h1>
            <p className="mb-6 max-w-xl text-sm text-muted-foreground sm:text-base">
              Geiger Comms brings email, chat, and social into a single queue
              with assignment, automations, and a help center. Reply faster and
              keep your whole team aligned — the open-source Intercom
              alternative.
            </p>
            <Link
              href={dashboardHref}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-zinc-100 px-6 text-sm font-medium text-zinc-950 transition-colors hover:bg-white sm:text-base"
            >
              Go to Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="mx-auto my-10 w-full sm:my-20">
          <CommsPlaygroundShowcase ctaHref={dashboardHref} backgroundImage={showcaseBg} />
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-3">
          {utilityCards.map(({ title, description, icon: Icon }) => (
            <article
              key={title}
              className="rounded-sm border border-border bg-[#191919] p-5"
            >
              <Icon className="mb-3 h-5 w-5 text-muted-foreground" />
              <h2 className="font-medium text-foreground">{title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            </article>
          ))}
        </section>

        <section className="mx-auto mt-10 flex w-full max-w-6xl flex-col gap-6 px-4 sm:px-6 md:mt-16 md:flex-row">
          <div className="md:w-[35%]">
            <h2 className="text-3xl font-semibold text-white">Questions & Answers</h2>
          </div>
          <div className="md:w-[65%]">
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq) => (
                <AccordionItem
                  key={faq.value}
                  value={faq.value}
                  className="border-border"
                >
                  <AccordionTrigger className="text-foreground hover:text-foreground hover:no-underline">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        <section className="relative z-20 overflow-hidden px-4 py-16 sm:px-6 sm:py-24 lg:py-32">
          <div className="container mx-auto relative z-10 flex flex-col items-center text-center">
            <h3 className="mb-4 text-xs font-semibold tracking-widest text-foreground0 uppercase sm:text-sm">
              Open source from day one
            </h3>
            <h2 className="mb-8 bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-3xl font-black tracking-tighter text-transparent drop-shadow-lg sm:mb-10 sm:text-5xl lg:text-6xl">
              TRY GEIGER NOW
            </h2>
            <div className="flex w-full max-w-md flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link
                href={dashboardHref}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-zinc-100 px-6 text-sm font-medium text-zinc-950 transition-colors hover:bg-white sm:w-auto"
              >
                Studio
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-zinc-100 px-6 text-sm font-medium text-zinc-950 transition-colors hover:bg-white sm:w-auto"
              >
                Contact Sales
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
