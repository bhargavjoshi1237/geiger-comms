"use client";

// The three-pane inbox frame. All shared state lives in useInboxShell — this
// component is presentational glue: it renders the panes and dialogs and
// takes props from the hook. Your Inbox / All Conversations / Mentions are
// this component with a different starting filter — never three copies.
//
// Layout contract (the single most common bug): root is flex h-full min-h-0
// and EVERY scrolling child carries min-h-0, so panes scroll instead of the
// page growing.

import { Button } from "@geiger/ui";
import ConversationList from "./conversation_list";
import ConversationThread from "./conversation_thread";
import ContactPanel from "./contact_panel";
import NewConversationDialog from "./new_conversation_dialog";
import { SignedOutNotice } from "./signed_out_notice";
import { CustomSnoozeDialog } from "./custom_snooze_dialog";
import { TicketDialog } from "./ticket_dialog";
import { presetFilter, useInboxShell } from "./use_inbox_shell";

export function InboxShell({ preset = "all", startFilter }) {
  const {
    conversationId,
    closeThread,
    canReply,
    filter,
    setFilter,
    page,
    teammates,
    allTags,
    mentionIds,
    loading,
    loadMore,
    threadLoading,
    messages,
    newOpen,
    setNewOpen,
    customSnooze,
    setCustomSnooze,
    ticketDraft,
    setTicketDraft,
    visibleRows,
    activeRow,
    selectConversation,
    setFocusedId,
    handleAssign,
    handleSnooze,
    handleClose,
    handleReopen,
    handlePriority,
    handleMarkUnread,
    handleSetTags,
    handleSend,
    handleCreateConversation,
    handleCreateTicket,
    waitingOnIdentity,
    signedOut,
  } = useInboxShell({ preset, startFilter });

  // Signed-out gate (spec §5.6): Your Inbox and Mentions explain themselves;
  // All Conversations still lists rows.
  if (signedOut) {
    return (
      <div className="flex h-full items-center justify-center">
        <SignedOutNotice />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* list pane */}
      <div className="h-full min-h-0 w-[380px] shrink-0 max-lg:w-full">
        <ConversationList
          loading={loading || waitingOnIdentity}
          error={page.failed}
          conversations={visibleRows}
          activeId={conversationId}
          filter={filter}
          teammates={teammates}
          mentionIds={mentionIds}
          hasMore={page.hasMore}
          onLoadMore={loadMore}
          onSelect={(id) => selectConversation(id)}
          onFilterChange={(next) => {
            setFocusedId(null);
            setFilter(next);
          }}
          onClearFilters={() => setFilter(presetFilter(preset))}
          onNewConversation={() => setNewOpen(true)}
        />
      </div>

      {/* thread pane */}
      <div className="hidden h-full min-h-0 flex-1 flex-col lg:flex">
        <ConversationThread
          conversation={activeRow}
          loading={threadLoading}
          messages={messages}
          teammates={teammates}
          canReply={canReply}
          replyDisabledReason={
            canReply
              ? null
              : "You don't have permission to reply (comms.conversation.reply)."
          }
          onSend={handleSend}
          onAssign={handleAssign}
          onSnooze={handleSnooze}
          onClose={handleClose}
          onReopen={handleReopen}
          onPriority={handlePriority}
          onMarkUnread={handleMarkUnread}
          onToggleTags={() => {}} // tags are edited in the contact panel picker
          onCreateTicket={(conversation) => setTicketDraft(conversation)}
        />
      </div>

      {/* contact pane */}
      <ContactPanel
        conversation={activeRow}
        tags={allTags}
        onSetTags={handleSetTags}
        onCreateTicket={(conversation) => setTicketDraft(conversation)}
      />

      {/* below-lg back affordance over the thread */}
      {conversationId ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={closeThread}
          className="absolute left-2 top-2 z-20 h-auto bg-surface-card px-2 py-1 text-xs lg:hidden"
        >
          ← Back to list
        </Button>
      ) : null}

      <NewConversationDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreate={handleCreateConversation}
      />

      <CustomSnoozeDialog
        conversation={customSnooze}
        onConfirm={(iso) => {
          setCustomSnooze(null);
          if (customSnooze) void handleSnooze(customSnooze, iso);
        }}
        onCancel={() => setCustomSnooze(null)}
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
