// Three Notification Feed layouts, switchable with ?variant=A|B|C on /prototype/notifications.
import { createSign } from "node:crypto";
import { useEffect, useMemo, useState } from "react";
import { data, Link, useSearchParams } from "react-router";
import type { Route } from "./+types/prototype.notifications";
import {
  Bell,
  Check,
  ChevronRight,
  ChevronLeft,
  Circle,
  Clock3,
  Inbox,
  MailOpen,
  MessageCircle,
  ReceiptText,
  Sparkles,
  X,
} from "lucide-react";
import { getCurrentUserId } from "~/lib/session";

type VariantKey = "A" | "B" | "C";
type FeedSource = "examples" | "live";
type FeedFilter = "all" | "unread";

interface KnockNotification {
  id: string;
  source?: string;
  inserted_at?: string;
  read_at?: string | null;
  seen_at?: string | null;
  data?: Record<string, unknown>;
  actors?: { id?: string; name?: string; avatar?: string }[];
}

interface PrototypeLoaderData {
  userId: string;
  publicApiKey: string;
  feedChannelId: string;
  userToken: string;
}

const SAMPLE_NOTIFICATIONS: KnockNotification[] = [
  {
    id: "sample-refund-approved",
    source: "refund-request-approved",
    inserted_at: new Date(Date.now() - 12 * 60_000).toISOString(),
    data: {
      kind: "Refund approved",
      title: "Your refund was approved",
      body: "Your refund for Introduction to TypeScript has been approved. The payment should appear in 5–10 business days.",
      context: "Introduction to TypeScript",
      href: "/courses/introduction-to-typescript",
      actionLabel: "View course",
    },
    actors: [{ name: "Riley Morgan" }],
  },
  {
    id: "sample-discussion-reply",
    source: "discussion-reply",
    inserted_at: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
    data: {
      kind: "Discussion reply",
      title: "Maya replied to your question",
      body: "“The key is to keep the state transition in one place, then let each component subscribe to it.”",
      context: "State management · Module 4",
      href: "/courses/design-systems-with-tailwind",
      actionLabel: "Open course",
    },
    actors: [{ name: "Maya Chen" }],
    seen_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
  },
  {
    id: "sample-new-enrollment",
    source: "new-enrollment",
    inserted_at: new Date(Date.now() - 26 * 60 * 60_000).toISOString(),
    data: {
      kind: "New enrollment",
      title: "Jordan Lee enrolled in Product Analytics",
      body: "A new student joined your course.",
      context: "Product Analytics Foundations",
      href: "/instructor",
      actionLabel: "View my courses",
    },
    actors: [{ name: "Jordan Lee" }],
    read_at: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
  },
];

const VARIANTS: { key: VariantKey; name: string }[] = [
  { key: "A", name: "Inbox" },
  { key: "B", name: "Split view" },
  { key: "C", name: "Activity stream" },
];

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function signKnockUserToken(userId: string, signingKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const userResource = `https://api.knock.app/v1/users/${userId}`;
  const payload = base64Url(
    JSON.stringify({
      sub: userId,
      iat: now,
      exp: now + 60 * 60,
      explicit_grants: true,
      grants: {
        [userResource]: {
          "user/feed_read": [{}],
          "user/feed_write": [{}],
        },
      },
    })
  );
  const unsignedToken = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  return `${unsignedToken}.${signer.sign(signingKey).toString("base64url")}`;
}

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) {
    throw data("Select a user from the DevUI panel to preview Notifications.", {
      status: 401,
    });
  }

  const publicApiKey = process.env.KNOCK_PUBLIC_API_KEY;
  const signingKey = process.env.KNOCK_SIGNING_KEY;
  const feedChannelId = process.env.KNOCK_FEED_CHANNEL_ID;
  if (!publicApiKey || !signingKey || !feedChannelId) {
    throw new Error(
      "Set KNOCK_PUBLIC_API_KEY, KNOCK_SIGNING_KEY, and KNOCK_FEED_CHANNEL_ID in .env to use the Notification Feed prototype."
    );
  }

  const decodedSigningKey = Buffer.from(signingKey, "base64").toString("utf8");
  return {
    userId: String(userId),
    publicApiKey,
    feedChannelId,
    userToken: signKnockUserToken(String(userId), decodedSigningKey),
  } satisfies PrototypeLoaderData;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function detailsFor(notification: KnockNotification) {
  const content = notification.data ?? {};
  const actor = notification.actors?.[0]?.name;
  return {
    title:
      stringValue(content.title) ??
      stringValue(content.name) ??
      notification.source ??
      "Notification",
    body:
      stringValue(content.body) ??
      stringValue(content.message) ??
      stringValue(content.description) ??
      "A new update is waiting for you.",
    kind: stringValue(content.kind) ?? notification.source ?? "Update",
    context: stringValue(content.context) ?? actor,
    href: stringValue(content.href) ?? stringValue(content.url),
    actionLabel: stringValue(content.actionLabel) ?? "Open in Cadence",
  };
}

function relativeTime(value?: string) {
  if (!value) return "Recently";
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

function isUnread(notification: KnockNotification) {
  return !notification.read_at;
}

function NotificationIcon({ source }: { source?: string }) {
  if (source?.includes("refund")) return <ReceiptText className="size-4" />;
  if (source?.includes("discussion")) return <MessageCircle className="size-4" />;
  if (source?.includes("enrollment")) return <Sparkles className="size-4" />;
  return <Bell className="size-4" />;
}

function FeedTabs({
  source,
  onChange,
  liveCount,
}: {
  source: FeedSource;
  onChange: (source: FeedSource) => void;
  liveCount: number;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
      {([
        ["examples", "Examples", "3"],
        ["live", "Knock live", String(liveCount)],
      ] as const).map(([key, label, count]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            source === key
              ? "bg-background font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
          <span className="ml-1.5 text-xs text-muted-foreground">{count}</span>
        </button>
      ))}
    </div>
  );
}

function FilterButtons({
  filter,
  onChange,
  unreadCount,
}: {
  filter: FeedFilter;
  onChange: (filter: FeedFilter) => void;
  unreadCount: number;
}) {
  return (
    <div className="flex gap-4 border-b">
      {(["all", "unread"] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={`border-b-2 pb-3 text-sm capitalize ${
            filter === value
              ? "border-primary font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {value}
          {value === "unread" && (
            <span className="ml-1.5 text-xs">{unreadCount}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function NotificationRow({
  notification,
  selected,
  onSelect,
  onRead,
  compact = false,
}: {
  notification: KnockNotification;
  selected?: boolean;
  onSelect: () => void;
  onRead: () => void;
  compact?: boolean;
}) {
  const details = detailsFor(notification);
  const unread = isUnread(notification);
  return (
    <div
      className={`flex gap-3 border-b transition-colors ${
        selected ? "bg-muted/70" : "hover:bg-muted/40"
      } ${compact ? "py-3" : "py-4"}`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
      >
        <span
          className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${
            unread
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <NotificationIcon source={notification.source} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            {unread && <Circle className="size-2 fill-primary text-primary" />}
            <span className={`truncate text-sm ${unread ? "font-semibold" : "font-medium"}`}>
              {details.title}
            </span>
          </span>
          {!compact && (
            <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">
              {details.body}
            </span>
          )}
          <span className="mt-1.5 block text-xs text-muted-foreground">
            {details.context ?? details.kind} · {relativeTime(notification.inserted_at)}
            {notification.seen_at && !notification.read_at && (
              <span className="ml-2 text-primary">Seen</span>
            )}
          </span>
        </span>
      </button>
      {unread && (
        <button
          type="button"
          title="Mark as read"
          aria-label={`Mark “${details.title}” as read`}
          onClick={(event) => {
            event.stopPropagation();
            onRead();
          }}
          className="mt-1 rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <Check className="size-4" />
        </button>
      )}
    </div>
  );
}

function NotificationDetail({
  notification,
  onRead,
  onClose,
}: {
  notification: KnockNotification | undefined;
  onRead: () => void;
  onClose?: () => void;
}) {
  if (!notification) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
        <Inbox className="mb-3 size-8" />
        <p className="text-sm">Select a Notification to read it.</p>
      </div>
    );
  }
  const details = detailsFor(notification);
  return (
    <article className="p-6">
      {onClose && (
        <div className="mb-5 flex justify-end">
          <button
            type="button"
            aria-label="Close Notification details"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      <div className="mb-5 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
        <NotificationIcon source={notification.source} />
      </div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {details.kind}
      </div>
      <h2 className="mt-2 text-xl font-semibold">{details.title}</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{details.body}</p>
      {details.context && (
        <div className="mt-5 rounded-lg bg-muted/60 p-3 text-sm">
          <div className="text-xs text-muted-foreground">Related to</div>
          <div className="mt-1 font-medium">{details.context}</div>
        </div>
      )}
      <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
        <Clock3 className="size-3.5" />
        {relativeTime(notification.inserted_at)}
        {notification.seen_at && (
          <span className="ml-2 inline-flex items-center gap-1">
            <MailOpen className="size-3.5" /> Seen
          </span>
        )}
      </div>
      {isUnread(notification) && (
        <button
          type="button"
          onClick={onRead}
          className="mt-6 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Mark as read
        </button>
      )}
      {details.href && (
        <Link
          to={details.href}
          className="mt-6 inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          {details.actionLabel}
          <ChevronRight className="size-4" />
        </Link>
      )}
    </article>
  );
}

function VariantA({
  notifications,
  filter,
  setFilter,
  selectedId,
  onSelect,
  onRead,
  onClose,
}: {
  notifications: KnockNotification[];
  filter: FeedFilter;
  setFilter: (filter: FeedFilter) => void;
  selectedId: string | null;
  onSelect: (notification: KnockNotification) => void;
  onRead: (notification: KnockNotification) => void;
  onClose: () => void;
}) {
  const unreadCount = notifications.filter(isUnread).length;
  const selected = notifications.find((item) => item.id === selectedId);
  return (
    <>
      <div className="mx-auto max-w-3xl px-6 py-8 lg:px-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Cadence / Inbox</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Notifications</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Updates about your courses and account.
            </p>
          </div>
          <span className="mt-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            {unreadCount} unread
          </span>
        </div>
        <FilterButtons filter={filter} onChange={setFilter} unreadCount={unreadCount} />
        {notifications.length ? (
          <div>
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                selected={selectedId === notification.id}
                onSelect={() => onSelect(notification)}
                onRead={() => onRead(notification)}
              />
            ))}
          </div>
        ) : (
          <EmptyFeed />
        )}
      </div>
      {selected && (
        <div className="fixed inset-0 z-30 flex justify-end bg-black/30">
          <button
            type="button"
            aria-label="Close Notification details"
            onClick={onClose}
            className="absolute inset-0 size-full cursor-default"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Notification details"
            className="relative z-10 h-full w-full max-w-lg overflow-y-auto border-l bg-background shadow-2xl"
          >
            <NotificationDetail
              notification={selected}
              onRead={() => onRead(selected)}
              onClose={onClose}
            />
          </div>
        </div>
      )}
    </>
  );
}

function VariantB({
  notifications,
  filter,
  setFilter,
  selectedId,
  onSelect,
  onRead,
}: {
  notifications: KnockNotification[];
  filter: FeedFilter;
  setFilter: (filter: FeedFilter) => void;
  selectedId: string | null;
  onSelect: (notification: KnockNotification) => void;
  onRead: (notification: KnockNotification) => void;
}) {
  const unreadCount = notifications.filter(isUnread).length;
  const selected = notifications.find((item) => item.id === selectedId);
  return (
    <div className="flex h-full min-h-[calc(100vh-3.5rem)] flex-col p-5 lg:p-8">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Inbox</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {unreadCount} unread · select a row to preview
          </p>
        </div>
        <Bell className="size-5 text-muted-foreground" />
      </div>
      <FilterButtons filter={filter} onChange={setFilter} unreadCount={unreadCount} />
      <div className="mt-4 grid min-h-0 flex-1 overflow-hidden rounded-xl border bg-card lg:grid-cols-[minmax(18rem,0.9fr)_minmax(22rem,1.1fr)]">
        <div className="overflow-y-auto border-b p-3 lg:border-b-0 lg:border-r">
          {notifications.length ? (
            notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                selected={selectedId === notification.id}
                onSelect={() => onSelect(notification)}
                onRead={() => onRead(notification)}
                compact
              />
            ))
          ) : (
            <EmptyFeed />
          )}
        </div>
        <div className="overflow-y-auto">
          <NotificationDetail
            notification={selected}
            onRead={() => selected && onRead(selected)}
          />
        </div>
      </div>
    </div>
  );
}

function VariantC({
  notifications,
  filter,
  setFilter,
  selectedId,
  onSelect,
  onRead,
  onClose,
}: {
  notifications: KnockNotification[];
  filter: FeedFilter;
  setFilter: (filter: FeedFilter) => void;
  selectedId: string | null;
  onSelect: (notification: KnockNotification) => void;
  onRead: (notification: KnockNotification) => void;
  onClose: () => void;
}) {
  const unreadCount = notifications.filter(isUnread).length;
  return (
    <div className="mx-auto max-w-4xl px-6 py-8 lg:px-10">
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
            <Bell className="size-4" /> Your activity
          </span>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Latest updates</h1>
        </div>
        <div className="pb-1 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{unreadCount}</span> to catch up on
        </div>
      </div>
      <FilterButtons filter={filter} onChange={setFilter} unreadCount={unreadCount} />
      <div className="pt-6">
        {notifications.length ? (
          <div className="relative">
            <div className="absolute bottom-5 left-[17px] top-5 w-px bg-border" />
            {notifications.map((notification) => (
              <div key={notification.id} className="relative flex gap-5">
                <div
                  className={`z-10 mt-5 flex size-9 shrink-0 items-center justify-center rounded-full border ${
                    isUnread(notification)
                      ? "border-primary/30 bg-background text-primary"
                      : "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  <NotificationIcon source={notification.source} />
                </div>
                <div className="min-w-0 flex-1">
                  <NotificationRow
                    notification={notification}
                    selected={selectedId === notification.id}
                    onSelect={() => onSelect(notification)}
                    onRead={() => onRead(notification)}
                    compact
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyFeed />
        )}
      </div>
      {notifications.some((item) => item.id === selectedId) && (
        <div className="fixed inset-0 z-30 flex justify-end bg-black/30">
          <button
            type="button"
            aria-label="Close Notification details"
            onClick={onClose}
            className="absolute inset-0 size-full cursor-default"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Notification details"
            className="relative z-10 h-full w-full max-w-lg overflow-y-auto border-l bg-background shadow-2xl"
          >
            <NotificationDetail
              notification={notifications.find((item) => item.id === selectedId)}
              onRead={() => {
                const selected = notifications.find((item) => item.id === selectedId);
                if (selected) onRead(selected);
              }}
              onClose={onClose}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyFeed() {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
        <Inbox className="size-5 text-muted-foreground" />
      </div>
      <h2 className="font-medium">You’re all caught up</h2>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        New course and account updates will show up here.
      </p>
    </div>
  );
}

export default function NotificationsPrototype({
  loaderData,
}: Route.ComponentProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedVariant = searchParams.get("variant");
  const variant: VariantKey =
    requestedVariant === "B" || requestedVariant === "C" ? requestedVariant : "A";
  const [source, setSource] = useState<FeedSource>("examples");
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [examples, setExamples] = useState(SAMPLE_NOTIFICATIONS);
  const [liveNotifications, setLiveNotifications] = useState<KnockNotification[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadFeed() {
      setLoading(true);
      setLiveError(null);
      try {
        const url = new URL(
          `https://api.knock.app/v1/users/${encodeURIComponent(loaderData.userId)}/feeds/${encodeURIComponent(loaderData.feedChannelId)}`
        );
        url.searchParams.set("status", "all");
        url.searchParams.set("archived", "exclude");
        url.searchParams.set("mode", "rich");
        url.searchParams.set("page_size", "30");
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${loaderData.publicApiKey}`,
            "X-Knock-User-Token": loaderData.userToken,
          },
        });
        if (!response.ok) {
          throw new Error(`Knock returned HTTP ${response.status}: ${await response.text()}`);
        }
        const payload = (await response.json()) as { entries?: KnockNotification[] };
        if (active) setLiveNotifications(payload.entries ?? []);
      } catch (error) {
        if (active) {
          setLiveError(error instanceof Error ? error.message : "Unable to load the Knock feed.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadFeed();
    return () => {
      active = false;
    };
  }, [loaderData.feedChannelId, loaderData.publicApiKey, loaderData.userId, loaderData.userToken]);

  const notifications = useMemo(() => {
    const activeItems = source === "examples" ? examples : liveNotifications;
    return activeItems.filter((item) => filter === "all" || isUnread(item));
  }, [examples, filter, liveNotifications, source]);

  async function updateLiveStatus(notification: KnockNotification, status: "read" | "seen") {
    setActionError(null);
    try {
      const response = await fetch(
        `https://api.knock.app/v1/messages/${encodeURIComponent(notification.id)}/${status}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${loaderData.publicApiKey}`,
            "X-Knock-User-Token": loaderData.userToken,
          },
        }
      );
      if (!response.ok) {
        throw new Error(`Knock returned HTTP ${response.status}: ${await response.text()}`);
      }
      const now = new Date().toISOString();
      setLiveNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, [status === "read" ? "read_at" : "seen_at"]: now }
            : item
        )
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to update this Notification.");
    }
  }

  function selectNotification(notification: KnockNotification) {
    setSelectedId(notification.id);
    if (source === "examples") {
      setExamples((current) =>
        current.map((item) =>
          item.id === notification.id && !item.seen_at
            ? { ...item, seen_at: new Date().toISOString() }
            : item
        )
      );
    } else if (!notification.seen_at) {
      void updateLiveStatus(notification, "seen");
    }
  }

  function markRead(notification: KnockNotification) {
    if (source === "examples") {
      setExamples((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, read_at: new Date().toISOString() }
            : item
        )
      );
    } else {
      void updateLiveStatus(notification, "read");
    }
  }

  function changeVariant(direction: number) {
    const index = VARIANTS.findIndex((item) => item.key === variant);
    const next = VARIANTS[(index + direction + VARIANTS.length) % VARIANTS.length];
    setSearchParams((current) => {
      const nextParams = new URLSearchParams(current);
      nextParams.set("variant", next.key);
      return nextParams;
    });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      if (event.key === "ArrowLeft") changeVariant(-1);
      if (event.key === "ArrowRight") changeVariant(1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const commonProps = {
    notifications,
    filter,
    setFilter,
    selectedId,
    onSelect: selectNotification,
    onRead: markRead,
    onClose: () => setSelectedId(null),
  };
  const unreadCount = notifications.filter(isUnread).length;
  const liveTotal = liveNotifications.length;

  return (
    <div className="min-h-full bg-background">
      <div className="border-b bg-card/70 px-6 py-3 lg:px-10">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Bell className="size-4" />
            </span>
            <div>
              <div className="text-sm font-semibold">Notification Feed</div>
              <div className="text-xs text-muted-foreground">
                Signed in as Cadence user {loaderData.userId}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <FeedTabs source={source} onChange={setSource} liveCount={liveTotal} />
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
              <span className={`size-2 rounded-full ${liveError ? "bg-destructive" : loading ? "bg-amber-500" : "bg-emerald-500"}`} />
              {liveError ? "Knock unavailable" : loading ? "Connecting" : "Knock connected"}
            </span>
          </div>
        </div>
      </div>

      {source === "examples" && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-center text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Catalogue examples for layout review only. They are not sent or stored in Knock.
        </div>
      )}

      {source === "live" && liveError && (
        <div className="mx-auto mt-5 max-w-5xl px-6">
          <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {liveError}
          </div>
        </div>
      )}
      {actionError && (
        <div className="mx-auto mt-5 max-w-5xl px-6">
          <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {actionError}
          </div>
        </div>
      )}
      {source === "live" && loading ? (
        <div className="p-12 text-center text-sm text-muted-foreground">Loading your Knock feed…</div>
      ) : variant === "A" ? (
        <VariantA {...commonProps} />
      ) : variant === "B" ? (
        <VariantB {...commonProps} />
      ) : (
        <VariantC {...commonProps} />
      )}

      {import.meta.env.DEV && (
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border bg-background/95 px-2 py-2 shadow-xl backdrop-blur">
          <button
            type="button"
            aria-label="Previous Notification Feed variant"
            onClick={() => changeVariant(-1)}
            className="rounded-full p-2 hover:bg-muted"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-36 text-center text-xs font-medium">
            {variant} · {VARIANTS.find((item) => item.key === variant)?.name}
          </span>
          <button
            type="button"
            aria-label="Next Notification Feed variant"
            onClick={() => changeVariant(1)}
            className="rounded-full p-2 hover:bg-muted"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
