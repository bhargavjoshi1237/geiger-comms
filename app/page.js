import Link from "next/link";
import { ArrowRight } from "lucide-react";
import CommsPlaygroundShowcase from "@/components/CommsPlaygroundShowcase";
import {
  AreaHero,
  AreaPage,
  AreaSection,
  CONTAINER,
  FeatureCell,
  FeatureGrid,
  Fit,
  HAIRLINE,
  HeroArt,
  PRIMARY_CTA,
  SECONDARY_CTA,
  SplitShowcase,
  Stage,
} from "@/components/landing/kit/area_kit";
import { CopilotRender, MacroRender, RatingRender, SlaRender } from "@/components/landing/comms_renders";
import { BulkRender, HeroInbox, InboxStage, NoteRender, SnoozeRender, TicketRender } from "@/components/landing/inbox_renders";
import { ChannelsRender, MessengerSettingsRender, MessengerStage, TopicsRender } from "@/components/landing/messenger_renders";
import { CopilotStage, FeatureSwitchesRender, ProvidersRender, TranslationRender } from "@/components/landing/copilot_renders";
import { RoutingRender, RunHistoryRender, WorkflowCanvasStage } from "@/components/landing/automation_renders";
import { ArticleStage, GapsRender, HelpTabRender } from "@/components/landing/knowledge_renders";
import { AnalyticsRender, CsatRender, ImportRender, SegmentRender, TimelinePanel } from "@/components/landing/customer_renders";
import { CommsFaq } from "@/components/landing/comms_faq";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Comms - Geiger Studio",
  description:
    "A shared inbox for customer conversations: a Messenger for your site, email replies, Copilot, workflows, SLAs, a knowledge base and reports. Part of the Geiger suite.",
};

const DASHBOARD_HREF = "/project";

const PROFILE_ITEMS = [
  { title: "Unified timeline", body: "Conversations, tickets, notes, tasks and tags in order" },
  { title: "Lifecycle stages", body: "Lead, trial, customer, VIP or churned" },
  { title: "Companies", body: "People, open conversations, plan and owner" },
  { title: "Segments", body: "Rules on stage, tags, company and more" },
  { title: "CSV import", body: "Preview new, updated and rejected rows" },
];

function Closing() {
  return (
    <section className={cn("border-t", HAIRLINE)}>
      <div className={cn(CONTAINER, "flex flex-col items-center py-28 text-center sm:py-40")}>
        <h2 className="text-[2.75rem] leading-none font-medium tracking-[-0.032em] text-balance sm:text-6xl lg:text-7xl">
          Talk to your customers.
          <br />
          Start today.
        </h2>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href={DASHBOARD_HREF} className={PRIMARY_CTA}>
            Open Comms
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a href="/pricing" className={SECONDARY_CTA}>
            See pricing
          </a>
        </div>
      </div>
    </section>
  );
}

export default function CommsLandingPage() {
  return (
    <AreaPage dashboardHref={DASHBOARD_HREF} closing={<Closing />}>
      <AreaHero
        eyebrow="Geiger Comms"
        title="Answer every customer from one shared inbox"
        art={
          <HeroArt focus={["66%", "44%"]} plane={{ "--plane-top": "-34%" }}>
            <HeroInbox typed="Thanks Maya, the updated invoice is on its way" />
          </HeroArt>
        }
      >
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href={DASHBOARD_HREF} className={PRIMARY_CTA}>
            Open Comms
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a href="#playground" className={SECONDARY_CTA}>
            Try it live
          </a>
        </div>
      </AreaHero>

      <AreaSection
        id="inbox"
        title="A shared inbox your whole team can work"
        lead="Every conversation lands in one queue. Assign it, mention a teammate in an internal note, snooze it until it matters and close it when it's done."
        link={{ label: "Try it in the live workspace", href: "#playground" }}
      >
        <Stage
          title="The queue, the thread and the customer, side by side"
          body="Work from Your Inbox, All Conversations, Mentions or a saved view. Filter by Open, Snoozed or Closed, sort by newest activity, oldest or priority, and see who has been waiting longest."
        >
          <Fit width={1040} height={620}>
            <InboxStage />
          </Fit>
        </Stage>
        <FeatureGrid>
          <FeatureCell title="Snooze it until it matters" body="Press S to snooze a conversation for an hour, three hours, until tomorrow at 9am, until next week, or until a time you choose.">
            <Fit width={460} height={300}>
              <SnoozeRender />
            </Fit>
          </FeatureCell>
          <FeatureCell title="Talk it through in a note" body="Internal notes sit in the thread, but only your team can see them. @mention a teammate to pull them in.">
            <Fit width={460} height={300}>
              <NoteRender />
            </Fit>
          </FeatureCell>
          <FeatureCell
            title="Turn a thread into a ticket"
            body="When a conversation needs work behind the scenes, open a Customer, Back-office or Tracker ticket and move it from Submitted to Resolved. A Tracker ticket can link many conversations."
          >
            <Fit width={440} height={250}>
              <TicketRender />
            </Fit>
          </FeatureCell>
          <FeatureCell title="Clear the queue in one go" body="Select conversations to assign, snooze, close, reopen, tag or reprioritise them together, or select everything that matches your filters.">
            <Fit width={460} height={300}>
              <BulkRender />
            </Fit>
          </FeatureCell>
        </FeatureGrid>
      </AreaSection>

      <AreaSection
        id="messenger"
        title="A Messenger that lives on your site"
        lead="Add one snippet and customers can message you from any page. They see who they're talking to, start on the right topic and find answers in your help articles."
      >
        <Stage
          title="Home, Messages, Help, News and Tickets in one launcher"
          body="Home greets visitors and shows their latest conversation. Help, News and Tickets appear as soon as you have articles, posts or tickets to show."
        >
          <Fit width={1000} height={620}>
            <MessengerStage />
          </Fit>
        </Stage>
        <FeatureGrid>
          <FeatureCell title="Make it look like yours" body="Set the launcher colour, greeting and position, choose whether to show your team's faces, and add a note about your office hours.">
            <Fit width={440} height={250}>
              <MessengerSettingsRender />
            </Fit>
          </FeatureCell>
          <FeatureCell title="Start on the right topic" body="Customers say what their message is about before they write it, so it reaches your queue with context.">
            <Fit width={320} height={330}>
              <TopicsRender />
            </Fit>
          </FeatureCell>
          <FeatureCell title="Ask how it went" body="When a conversation closes, the Messenger asks the customer to rate it from Poor to Great. Ratings feed the Quality & CSAT report.">
            <Fit width={300} height={250}>
              <RatingRender />
            </Fit>
          </FeatureCell>
          <FeatureCell title="Email replies today, more channels on the way" body="Replies can go out by email as well as in the Messenger. WhatsApp, SMS, social and Slack are next, and you can already save their settings.">
            <Fit width={440} height={330}>
              <ChannelsRender />
            </Fit>
          </FeatureCell>
        </FeatureGrid>
      </AreaSection>

      <AreaSection
        id="copilot"
        title="Copilot drafts, your team decides"
        lead="Catch up on a long thread in seconds, polish a reply without retyping it and talk to customers in their own language. Copilot runs on the AI provider you choose."
      >
        <Stage
          title="A summary before you reply"
          body="Summarise any conversation into a few bullet points, then regenerate it or drop it into the thread as an internal note. Every summary says which provider and model wrote it."
        >
          <Fit width={1000} height={600}>
            <CopilotStage />
          </Fit>
        </Stage>
        <FeatureGrid>
          <FeatureCell title="Rewrite a draft in one click" body="Rephrase, make it friendlier or more formal, shorten, expand or fix the spelling and grammar. Every rewrite can be undone.">
            <Fit width={460} height={300}>
              <CopilotRender />
            </Fit>
          </FeatureCell>
          <FeatureCell title="Speak your customer's language" body="Translate a customer's message inline with the original a click away, and translate your reply into their language before you send it.">
            <Fit width={460} height={300}>
              <TranslationRender />
            </Fit>
          </FeatureCell>
          <FeatureCell title="Bring your own AI provider" body="Connect OpenAI, Anthropic, Gemini, OpenRouter, Mistral, Groq, Ollama and more. Your provider bills you directly, and keys are encrypted in Supabase Vault.">
            <Fit width={440} height={330}>
              <ProvidersRender />
            </Fit>
          </FeatureCell>
          <FeatureCell title="Switch on only what you want" body="Turn each AI feature on or off on its own, from the inbox copilot to knowledge gap clustering, and give each one a daily limit.">
            <Fit width={440} height={270}>
              <FeatureSwitchesRender />
            </Fit>
          </FeatureCell>
        </FeatureGrid>
      </AreaSection>

      <AreaSection
        id="automation"
        title="Automation for the busywork"
        lead="Workflows run on their own when something happens in the inbox. Routing rules decide who gets what, SLAs keep time and macros answer the common questions."
      >
        <Stage
          title="Build workflows on a canvas"
          body="Start from a trigger like a new conversation or a tag being added, check conditions such as priority, channel or office hours, then assign, tag, snooze, apply an SLA, convert to a ticket or call a webhook."
        >
          <Fit width={1000} height={620}>
            <WorkflowCanvasStage />
          </Fit>
        </Stage>
        <FeatureGrid>
          <FeatureCell title="Route every conversation to the right person" body="Choose round robin, balanced or direct assignment for each rule, matched on channel, priority or tags. Direct rules skip people who are offline.">
            <Fit width={460} height={330}>
              <RoutingRender />
            </Fit>
          </FeatureCell>
          <FeatureCell title="Hold the line on response times" body="SLA policies time first response, next response and resolution inside your business hours, and warn the team before a deadline slips.">
            <Fit width={460} height={300}>
              <SlaRender />
            </Fit>
          </FeatureCell>
          <FeatureCell title="Answer the common questions in a keystroke" body="Type # to insert a macro with the customer's details filled in. Macros can also tag, assign, snooze or close the conversation when you send.">
            <Fit width={460} height={300}>
              <MacroRender />
            </Fit>
          </FeatureCell>
          <FeatureCell title="See every run" body="Run History lists each workflow run with its status and duration, so a failing step gets noticed before customers notice it.">
            <Fit width={460} height={290}>
              <RunHistoryRender />
            </Fit>
          </FeatureCell>
        </FeatureGrid>
      </AreaSection>

      <AreaSection
        id="knowledge"
        title="Answers customers can find themselves"
        lead="Write help articles with an AI writing assistant, translate them into 31 locales and publish them to the Help tab of your Messenger."
      >
        <Stage
          title="Articles that know when a translation falls behind"
          body="Each translation shows whether it's published, missing or out of date with the original, so nobody follows stale instructions. Publish changes when they're ready."
        >
          <Fit width={1000} height={600}>
            <ArticleStage />
          </Fit>
        </Stage>
        <FeatureGrid>
          <FeatureCell
            title="Find the questions nobody has answered"
            body="Knowledge Gaps groups the questions customers ask that no article covers, ranks them by impact and trend, and lets you write the missing article from there."
          >
            <Fit width={460} height={330}>
              <GapsRender />
            </Fit>
          </FeatureCell>
          <FeatureCell title="Help inside the Messenger" body="Your help center powers the Messenger's Help tab, so customers can search your articles and browse collections without leaving your site.">
            <Fit width={320} height={360}>
              <HelpTabRender />
            </Fit>
          </FeatureCell>
        </FeatureGrid>
      </AreaSection>

      <AreaSection
        id="customers"
        title="Know who you're talking to"
        lead="Every person has a profile with one timeline of their conversations, tickets, notes, tasks and tags. Group them by company, slice them into segments and bring your list in from a CSV."
      >
        <SplitShowcase
          items={PROFILE_ITEMS}
          title="One profile per customer"
          body="Open a profile from any conversation to see everything that has happened with that person, and add a note or a task without leaving it."
        >
          <TimelinePanel />
        </SplitShowcase>
        <FeatureGrid>
          <FeatureCell title="Slice your customers your way" body="Build segments from rules on lifecycle stage, tags, company, location, email subscription, sign-up date or your own attributes.">
            <Fit width={460} height={230}>
              <SegmentRender />
            </Fit>
          </FeatureCell>
          <FeatureCell
            title="Bring your list with you"
            body="Import people and companies from a CSV. Columns map to fields automatically, and the preview shows what's new, what changes and what gets rejected before anything is saved."
          >
            <Fit width={460} height={290}>
              <ImportRender />
            </Fit>
          </FeatureCell>
        </FeatureGrid>
      </AreaSection>

      <AreaSection
        id="reports"
        title="See how the team is doing"
        lead="Track volume, response times and SLA hit rates across the team, and see how customers rated the help they got."
      >
        <FeatureGrid>
          <FeatureCell title="Know how fast you answer" body="Analytics follows new and closed conversations, median and 90th percentile first response, time to close, SLA hit rates and each teammate's numbers.">
            <Fit width={460} height={300}>
              <AnalyticsRender />
            </Fit>
          </FeatureCell>
          <FeatureCell title="Know how customers felt" body="Quality & CSAT turns Messenger ratings into a score, a rating distribution and a trend over time.">
            <Fit width={460} height={230}>
              <CsatRender />
            </Fit>
          </FeatureCell>
        </FeatureGrid>
      </AreaSection>

      <AreaSection
        id="playground"
        title="Try the whole workspace"
        lead="The Comms workspace runs right here on the page. Open any screen from the sidebar and click around. Nothing you do here is saved."
        link={{ label: "Open Comms", href: DASHBOARD_HREF, internal: true }}
      >
        <CommsPlaygroundShowcase />
      </AreaSection>

      <CommsFaq />
    </AreaPage>
  );
}
