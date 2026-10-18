"use client";

import React from "react";
import {
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  useSidebar,
} from "@geiger/ui";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { Button } from "@geiger/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@geiger/ui";

export function SidebarOption({
  title,
  icon: Icon,
  isActive,
  onClick,
  badge,
  className,
  subItems,
  isExpanded,
  onToggle,
  activeSubTab,
  iconColor,
  subBadges,
}) {
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed" && !isMobile;
  // A folded group surfaces its children's badges on the parent row so they're never hidden.
  const childBadges = (subItems || []).map((sub) => subBadges?.[sub.title]).filter(Boolean);
  const groupBadge = subItems && !isExpanded && childBadges.length > 0 ? childBadges.join(" · ") : null;

  const activeIconColor = iconColor || "text-foreground";
  const inactiveIconColor = iconColor || "text-sidebar-foreground/70";

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        onClick={subItems ? onToggle : () => onClick?.()}
        isActive={isActive}
        tooltip={title}
        className={cn(
          "transition-all text-sm h-9 group-data-[collapsible=icon]:justify-center",
          isActive && !subItems
            ? "bg-sidebar-accent text-foreground"
            : isExpanded
              ? "bg-sidebar-accent/40 text-sidebar-foreground"
              : "text-sidebar-foreground",
          className,
        )}
      >
        {Icon && (
          <Icon
            className={cn(
              "w-4 h-4 shrink-0 transition-colors",
              isActive
                ? activeIconColor
                : inactiveIconColor,
            )}
          />
        )}
        {!isCollapsed && <span>{title}</span>}
        {groupBadge && !isCollapsed ? (
          <span className="ml-auto rounded-full border border-border bg-surface-active px-1.5 text-[10px] font-medium leading-4 text-foreground tabular-nums">
            {groupBadge}
          </span>
        ) : null}
        {subItems && !isCollapsed && (
          <ChevronDown
            className={cn(
              "w-4 h-4 transition-transform duration-200",
              !groupBadge && "ml-auto",
              isExpanded && "rotate-180",
            )}
          />
        )}
        {badge && !subItems && !isCollapsed && (
          <SidebarMenuBadge className="mr-2 text-muted-foreground text-[10px] px-1.5 py-0.5 rounded border border-border ml-auto">
            {badge}
          </SidebarMenuBadge>
        )}
      </SidebarMenuButton>

      {subItems && isExpanded && !isCollapsed && (
        <ul className="ml-[1px] mt-1 mb-1 flex flex-col gap-0.5 pl-2">
          {subItems.map((sub) => (
            <li key={sub.title}>
              <Button
                type="button"
                variant="ghost"
                onClick={(e) => {
                  e.preventDefault();
                  onClick(sub.title);
                }}
                className={cn(
                  "relative w-full flex items-center justify-start px-2 h-[35px] rounded-md text-sm leading-none transition-colors gap-2",
                  activeSubTab === sub.title
                    ? "bg-sidebar-accent text-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:text-foreground hover:bg-sidebar-accent/50",
                )}
              >
                {sub.icon && (
                  <sub.icon
                    className={cn(
                      "w-4 h-4 shrink-0 transition-colors",
                      activeSubTab === sub.title
                        ? iconColor || "text-foreground"
                        : iconColor || "text-sidebar-foreground/70",
                    )}
                  />
                )}
                <p className="">{sub.title}</p>
                {subBadges?.[sub.title] ? (
                  <span
                    className="ml-auto rounded-full border border-border bg-surface-active px-1.5 text-[10px] font-medium leading-4 text-foreground tabular-nums"
                    aria-label={`${subBadges[sub.title]} unread`}
                  >
                    {subBadges[sub.title]}
                  </span>
                ) : null}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {subItems && isExpanded && isCollapsed && (
        <ul className="flex flex-col gap-0.5 pt-2">
          {subItems.map((sub) => (
            <li key={sub.title}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={(e) => {
                      e.preventDefault();
                      onClick(sub.title);
                    }}
                    className={cn(
                      "relative w-full flex items-center justify-center px-2 h-[35px] rounded-md text-sm leading-none transition-colors",
                      activeSubTab === sub.title
                        ? "bg-sidebar-accent text-foreground font-medium"
                        : "text-sidebar-foreground/70 hover:text-foreground hover:bg-sidebar-accent/50",
                    )}
                  >
                    {sub.icon && (
                      <sub.icon
                        className={cn(
                          "w-4 h-4 shrink-0 transition-colors",
                          activeSubTab === sub.title
                            ? iconColor || "text-foreground"
                            : iconColor || "text-sidebar-foreground/70",
                        )}
                      />
                    )}
                    {subBadges?.[sub.title] ? (
                      <span className="pointer-events-none absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                    ) : null}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" align="center">
                  {sub.title}
                  {subBadges?.[sub.title] ? ` · ${subBadges[sub.title]} unread` : ""}
                </TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
    </SidebarMenuItem>
  );
}
