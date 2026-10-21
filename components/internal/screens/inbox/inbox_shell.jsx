"use client";

// The three-pane inbox frame; all shared state lives in useInboxShell and this component is presentational glue.
// Layout contract: root is flex h-full min-h-0 and EVERY scrolling child carries min-h-0, so panes scroll instead of the page.
// Below lg: one pane at a time (list, or the open thread with a back affordance); the contact panel becomes a sheet.

import { Sheet, SheetContent, SheetTitle } from "@geiger/ui";
import { cn } from "@/lib/utils";
import ConversationList from "./conversation_list";
import ConversationThread from "./conversation_thread";
import { ContactDetails, ContactPanel } from "./contact_panel";
import NewConversationDialog from "./new_conversation_dialog";
import { SignedOutNotice } from "./signed_out_notice";
import { CustomSnoozeDialog } from "./custom_snooze_dialog";
import { TicketDialog } from "./ticket_dialog";
import { MergeDialog } from "./merge_dialog";
import { ASSIGN_DENIED, CLOSE_DENIED, REPLY_DENIED, useInboxShell } from "./use_inbox_shell";

const TITLES = { all: "All conversations", mine: "Your inbox", mentions: "Mentions" };

export function InboxShell({ preset = "all", startFilter, title }) {
  const shell = useInboxShell({ preset, startFilter });
  const {
    projectId,
    conversationId,
    closeThread,
    canReply,
    canAssign,
    canClose,
    filter,
    updateFilter,
    clearFilters,
    clearChannelFilter,
    isFiltered,
    activeChannel,
    channels,
    page,
    teammates,
    me,
    allTags,
    initialLoading,
    refreshing,
    loadMore,
    threadLoading,
    threadMissing,
    messages,
    focusedId,
    newOpen,
    setNewOpen,
    customSnooze,
    setCustomSnooze,
    ticketDraft,
    setTicketDraft,
    menu,
    setMenu,
    contactOpen,
    setContactOpen,
    visibleRows,
    activeRow,
    selectConversation,
    handleAssign,
    handleSnooze,
    handleClose,
    handleReopen,
    handlePriority,
    handleToggleRead,
    handleToggleTag,
    handleCreateTag,
    handleSend,
    handleCreateConversation,
    handleCreateTicket,
    macros,
    resolveMacroBody,
    handleRunMacro,
    handleUpload,
    mergeSource,
    setMergeSource,
    handleMerge,
    bulk,
    bulkSnoozeOpen,
    setBulkSnoozeOpen,
    signedOut,
  } = shell;

  // Signed-out gate (spec §5.6): Your Inbox and Mentions explain themselves; All Conversations still lists rows.
  if (signedOut) {
    return (
      <div className="flex h-full items-center justify-center">
        <SignedOutNotice />
      </div>
    );
  }

  const threadOpen = Boolean(conversationId);
  // A thread/contact is "loading" while its row is being resolved (first page or deep-link fetch).
  const activeLoading = threadOpen && !activeRow && !threadMissing;
  const contactProps = {
    tags: allTags,
    teammates,
    me,
    projectId,
    assignDisabledReason: canAssign ? null : ASSIGN_DENIED,
    onAssign: handleAssign,
    onPriority: handlePriority,
    onToggleTag: handleToggleTag,
    onCreateTag: handleCreateTag,
    onCreateTicket: (conversation) => setTicketDraft(conversation),
  };

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* list pane — full width below lg unless a thread is open */}
      <div className={cn("h-full min-h-0 w-full shrink-0 lg:block lg:w-[340px]", threadOpen ? "hidden" : "block")}>
        <ConversationList
          title={title ?? TITLES[preset] ?? TITLES.all}
          preset={preset}
          initialLoading={initialLoading}
          refreshing={refreshing}
          error={page.failed}
          conversations={visibleRows}
          activeId={conversationId}
          focusedId={focusedId}
          filter={filter}
          isFiltered={isFiltered}
          teammates={teammates}
          tags={allTags}
          activeChannel={activeChannel}
          hasMore={page.hasMore}
          onLoadMore={loadMore}
          onSelect={selectConversation}
          onFilterChange={updateFilter}
          onClearFilters={clearFilters}
          onClearChannel={clearChannelFilter}
          onNewConversation={() => setNewOpen(true)}
          bulk={bulk}
          me={me}
          assignDisabledReason={canAssign ? null : ASSIGN_DENIED}
          closeDisabledReason={canClose ? null : CLOSE_DENIED}
        />
      </div>

      {/* thread pane — the only pane below lg while a thread is open */}
      <div className={cn("h-full min-h-0 min-w-0 flex-1 flex-col lg:flex", threadOpen ? "flex" : "hidden")}>
        <ConversationThread
          conversation={activeRow}
          loading={threadLoading}
          activeLoading={activeLoading}
          missing={threadMissing}
          messages={messages}
          teammates={teammates}
          me={me}
          canReply={canReply}
          replyDisabledReason={canReply ? null : REPLY_DENIED}
          assignDisabledReason={canAssign ? null : ASSIGN_DENIED}
          closeDisabledReason={canClose ? null : CLOSE_DENIED}
          canTrackRead={Boolean(me)}
          menu={menu && activeRow && menu.id === activeRow.id ? menu.kind : null}
          onMenuChange={(kind) => setMenu(kind && activeRow ? { kind, id: activeRow.id } : null)}
          onBack={() => {
            setContactOpen(false);
            closeThread();
          }}
          onOpenContact={() => setContactOpen(true)}
          onSend={handleSend}
          onAssign={handleAssign}
          onSnooze={handleSnooze}
          onClose={handleClose}
          onReopen={handleReopen}
          onToggleRead={handleToggleRead}
          onCreateTicket={(conversation) => setTicketDraft(conversation)}
          onMerge={(conversation) => setMergeSource(conversation)}
          onOpenConversation={selectConversation}
          macros={macros}
          onResolveMacro={resolveMacroBody}
          onRunMacro={handleRunMacro}
          onUpload={handleUpload}
        />
      </div>

      {/* contact pane (lg+) */}
      <ContactPanel conversation={activeRow} loading={activeLoading} {...contactProps} />

      {/* contact sheet (below lg), opened from the thread header */}
      <Sheet open={contactOpen && Boolean(activeRow)} onOpenChange={setContactOpen}>
        <SheetContent side="right" className="w-[320px] overflow-y-auto border-border p-5 pt-10 lg:hidden">
          <SheetTitle className="sr-only">Conversation details</SheetTitle>
          {activeRow ? <ContactDetails conversation={activeRow} {...contactProps} /> : null}
        </SheetContent>
      </Sheet>

      <NewConversationDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreate={handleCreateConversation}
        channels={channels}
      />

      <CustomSnoozeDialog
        open={Boolean(customSnooze)}
        onConfirm={(iso) => {
          setCustomSnooze(null);
          if (customSnooze) void handleSnooze(customSnooze, iso);
        }}
        onCancel={() => setCustomSnooze(null)}
      />

      <CustomSnoozeDialog
        open={bulkSnoozeOpen}
        onConfirm={(iso) => {
          setBulkSnoozeOpen(false);
          bulk.snooze(iso);
        }}
        onCancel={() => setBulkSnoozeOpen(false)}
      />

      <MergeDialog
        conversation={mergeSource}
        projectId={projectId}
        teammateId={me?.id ?? null}
        onCancel={() => setMergeSource(null)}
        onMerge={async (target) => {
          const ok = await handleMerge(mergeSource, target);
          if (ok) setMergeSource(null);
          return ok;
        }}
      />

      <TicketDialog
        conversation={ticketDraft}
        onCancel={() => setTicketDraft(null)}
        onCreate={handleCreateTicket}
      />
    </div>
  );
}

export default InboxShell;
