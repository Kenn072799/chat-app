import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  AlertCircle,
  CheckCheck,
  ChevronDown,
  Heart,
  LoaderCircle,
  LogOut,
  MessageSquare,
  RefreshCw,
  Reply,
  Send,
  Smile,
  WifiOff,
  X,
} from "lucide-react";
import { io } from "socket.io-client";

import { useAuth } from "../context/AuthContext";
import API from "../services/api";

const REACTION_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🥰"];
const MAX_MESSAGE_LENGTH = 2000;
const MESSAGE_PAGE_SIZE = 50;

function getReactions(message) {
  if (!message?.reactions) return {};

  if (typeof message.reactions === "string") {
    try {
      return JSON.parse(message.reactions);
    } catch {
      return {};
    }
  }

  return message.reactions;
}

function getReactionSummary(message) {
  const counts = Object.values(getReactions(message)).reduce(
    (summary, emoji) => ({
      ...summary,
      [emoji]: (summary[emoji] || 0) + 1,
    }),
    {},
  );

  return Object.entries(counts).map(([emoji, count]) => ({ emoji, count }));
}

function parseMessageDate(date) {
  if (!date) return null;

  if (typeof date === "string" && date.includes(" ") && !date.includes("T")) {
    return new Date(date.replace(" ", "T"));
  }

  return new Date(date);
}

function formatMessageTime(date) {
  const messageDate = parseMessageDate(date);
  if (!messageDate || Number.isNaN(messageDate.getTime())) return "";

  return messageDate.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatConversationDay(date) {
  const messageDate = parseMessageDate(date);
  if (!messageDate || Number.isNaN(messageDate.getTime())) return "";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDay = new Date(
    messageDate.getFullYear(),
    messageDate.getMonth(),
    messageDate.getDate(),
  );
  const dayDifference = Math.round(
    (today.getTime() - messageDay.getTime()) / 86400000,
  );

  if (dayDifference === 0) return "Today";
  if (dayDifference === 1) return "Yesterday";

  return messageDate.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year:
      messageDate.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

function isDifferentDay(message, previousMessage) {
  if (!previousMessage) return true;

  const currentDate = parseMessageDate(message.created_at);
  const previousDate = parseMessageDate(previousMessage.created_at);
  if (!currentDate || !previousDate) return false;

  return (
    currentDate.getFullYear() !== previousDate.getFullYear() ||
    currentDate.getMonth() !== previousDate.getMonth() ||
    currentDate.getDate() !== previousDate.getDate()
  );
}

export default function Chat() {
  const { user, logout } = useAuth();
  const [partner, setPartner] = useState(null);
  const [partnerLoading, setPartnerLoading] = useState(true);
  const [partnerError, setPartnerError] = useState("");
  const [partnerReloadKey, setPartnerReloadKey] = useState(0);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [olderMessagesCursor, setOlderMessagesCursor] = useState(null);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [olderMessagesError, setOlderMessagesError] = useState("");
  const [historyReloadKey, setHistoryReloadKey] = useState(0);
  const [newMessage, setNewMessage] = useState("");
  const [replyTarget, setReplyTarget] = useState(null);
  const [activeReactionMenuId, setActiveReactionMenuId] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [seenMessageId, setSeenMessageId] = useState(0);
  const [socketConnected, setSocketConnected] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [titleUnreadCount, setTitleUnreadCount] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [replyNavigationMessageId, setReplyNavigationMessageId] =
    useState(null);

  const socketRef = useRef(null);
  const partnerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const incomingTypingTimeoutRef = useRef(null);
  const messageListRef = useRef(null);
  const messagesEndRef = useRef(null);
  const composerRef = useRef(null);
  const knownMessageIdsRef = useRef(new Set());
  const isNearBottomRef = useRef(true);
  const shouldAutoScrollRef = useRef(true);
  const loadingOlderMessagesRef = useRef(false);
  const pendingScrollAdjustmentRef = useRef(null);
  const pendingReplyScrollRef = useRef(null);
  const replyNavigationRef = useRef(false);
  const highlightTimeoutRef = useRef(null);
  const originalDocumentTitleRef = useRef(document.title);

  const partnerIsOnline = onlineUsers.some(
    (onlineId) => Number(onlineId) === Number(partner?.id),
  );

  const lastOutgoingMessage = [...messages]
    .reverse()
    .find((message) => Number(message.sender_id) === Number(user.id));

  useEffect(() => {
    partnerRef.current = partner;
  }, [partner]);

  useEffect(() => {
    const originalTitle = originalDocumentTitleRef.current;
    const displayCount = titleUnreadCount > 99 ? "99+" : titleUnreadCount;

    document.title = titleUnreadCount
      ? `(${displayCount}) New ${titleUnreadCount === 1 ? "message" : "messages"} • ${originalTitle}`
      : originalTitle;

    return () => {
      document.title = originalTitle;
    };
  }, [titleUnreadCount]);

  useEffect(() => {
    const clearTitleNotification = () => {
      if (!document.hidden) setTitleUnreadCount(0);
    };

    document.addEventListener("visibilitychange", clearTitleNotification);
    window.addEventListener("focus", clearTitleNotification);

    return () => {
      document.removeEventListener("visibilitychange", clearTitleNotification);
      window.removeEventListener("focus", clearTitleNotification);
    };
  }, []);

  useEffect(() => {
    if (!composerRef.current) return;

    composerRef.current.style.height = "auto";
    composerRef.current.style.height = `${Math.min(
      composerRef.current.scrollHeight,
      128,
    )}px`;
  }, [newMessage]);

  useEffect(() => {
    const fetchPartner = async () => {
      setPartnerLoading(true);
      setPartnerError("");

      try {
        const response = await API.get("/messages/users");
        const onlyPartner = response.data[0] || null;
        setPartner(onlyPartner);
        partnerRef.current = onlyPartner;
      } catch (error) {
        console.error("Failed to load partner", error);
        setPartnerError("We couldn't open your conversation.");
      } finally {
        setPartnerLoading(false);
      }
    };

    fetchPartner();
  }, [partnerReloadKey]);

  useEffect(() => {
    const socketUrl =
      import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
    const socket = io(socketUrl, { withCredentials: true });
    socketRef.current = socket;

    socket.on("connect", () => setSocketConnected(true));
    socket.on("disconnect", () => setSocketConnected(false));
    socket.on("connect_error", () => setSocketConnected(false));
    socket.on("online_users", setOnlineUsers);

    socket.on("receive_message", (incomingMessage) => {
      const activePartner = partnerRef.current;
      const belongsToConversation =
        (Number(incomingMessage.sender_id) === Number(user.id) &&
          Number(incomingMessage.receiver_id) === Number(activePartner?.id)) ||
        (Number(incomingMessage.sender_id) === Number(activePartner?.id) &&
          Number(incomingMessage.receiver_id) === Number(user.id));

      if (!belongsToConversation) return;

      const messageId = String(incomingMessage.id);
      if (knownMessageIdsRef.current.has(messageId)) return;
      knownMessageIdsRef.current.add(messageId);

      const isIncoming =
        Number(incomingMessage.sender_id) !== Number(user.id);
      shouldAutoScrollRef.current = !isIncoming || isNearBottomRef.current;

      if (isIncoming && !isNearBottomRef.current) {
        setUnreadMessageCount((count) => count + 1);
      }

      if (isIncoming && (document.hidden || !document.hasFocus())) {
        setTitleUnreadCount((count) => count + 1);
      }

      setMessages((currentMessages) =>
        currentMessages.some(
          (message) => Number(message.id) === Number(incomingMessage.id),
        )
          ? currentMessages
          : [...currentMessages, incomingMessage],
      );

      if (Number(incomingMessage.sender_id) !== Number(user.id)) {
        socket.emit("mark_seen", {
          contactId: incomingMessage.sender_id,
          messageId: incomingMessage.id,
        });
      }
    });

    socket.on("message_reaction_updated", ({ messageId, reactions }) => {
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          Number(message.id) === Number(messageId)
            ? { ...message, reactions }
            : message,
        ),
      );
    });

    socket.on("user_typing", ({ fromUserId, isTyping }) => {
      if (Number(fromUserId) !== Number(partnerRef.current?.id)) return;

      if (incomingTypingTimeoutRef.current) {
        clearTimeout(incomingTypingTimeoutRef.current);
      }

      setIsPartnerTyping(Boolean(isTyping));
      if (isTyping) {
        incomingTypingTimeoutRef.current = setTimeout(
          () => setIsPartnerTyping(false),
          2200,
        );
      }
    });

    socket.on("messages_seen", ({ fromUserId, messageId }) => {
      if (Number(fromUserId) === Number(partnerRef.current?.id)) {
        setSeenMessageId(Number(messageId));
      }
    });

    return () => {
      setSocketConnected(false);
      socket.disconnect();
      if (incomingTypingTimeoutRef.current) {
        clearTimeout(incomingTypingTimeoutRef.current);
      }
    };
  }, [user.id]);

  useEffect(() => {
    if (!partner) {
      setMessages([]);
      knownMessageIdsRef.current = new Set();
      setMessagesError("");
      setMessagesLoading(false);
      setHasOlderMessages(false);
      setOlderMessagesCursor(null);
      setOlderMessagesLoading(false);
      setOlderMessagesError("");
      loadingOlderMessagesRef.current = false;
      pendingScrollAdjustmentRef.current = null;
      pendingReplyScrollRef.current = null;
      replyNavigationRef.current = false;
      setReplyNavigationMessageId(null);
      setHighlightedMessageId(null);
      setUnreadMessageCount(0);
      return;
    }

    let cancelled = false;

    const fetchHistory = async () => {
      setMessagesLoading(true);
      setMessagesError("");
      setHasOlderMessages(false);
      setOlderMessagesCursor(null);
      setOlderMessagesLoading(false);
      setOlderMessagesError("");
      loadingOlderMessagesRef.current = false;
      pendingScrollAdjustmentRef.current = null;
      pendingReplyScrollRef.current = null;
      replyNavigationRef.current = false;
      setReplyNavigationMessageId(null);
      setHighlightedMessageId(null);
      setReplyTarget(null);
      setActiveReactionMenuId(null);
      setUnreadMessageCount(0);
      isNearBottomRef.current = true;
      setIsNearBottom(true);
      shouldAutoScrollRef.current = true;

      try {
        const response = await API.get(`/messages/${partner.id}`, {
          params: { limit: MESSAGE_PAGE_SIZE },
        });
        if (cancelled) return;

        const historyMessages = Array.isArray(response.data)
          ? response.data
          : response.data.messages;
        knownMessageIdsRef.current = new Set(
          historyMessages.map((message) => String(message.id)),
        );
        setMessages(historyMessages);
        setHasOlderMessages(
          Array.isArray(response.data) ? false : response.data.hasMore,
        );
        setOlderMessagesCursor(
          Array.isArray(response.data) ? null : response.data.nextCursor,
        );
        const lastIncomingMessage = [...historyMessages]
          .reverse()
          .find(
            (message) => Number(message.sender_id) === Number(partner.id),
          );

        if (lastIncomingMessage && socketRef.current) {
          socketRef.current.emit("mark_seen", {
            contactId: partner.id,
            messageId: lastIncomingMessage.id,
          });
        }
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to fetch message history", error);
        setMessagesError("We couldn't load your messages.");
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    };

    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [partner, historyReloadKey]);

  useLayoutEffect(() => {
    const pendingAdjustment = pendingScrollAdjustmentRef.current;
    const messageList = messageListRef.current;
    if (!messageList) return;

    if (pendingAdjustment) {
      messageList.scrollTop =
        messageList.scrollHeight -
        pendingAdjustment.scrollHeight +
        pendingAdjustment.scrollTop;
      pendingScrollAdjustmentRef.current = null;
    }

    const pendingReplyId = pendingReplyScrollRef.current;
    if (pendingReplyId) {
      const originalMessage = messageList.querySelector(
        `[data-message-id="${pendingReplyId}"]`,
      );

      if (originalMessage) {
        originalMessage.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedMessageId(Number(pendingReplyId));
        if (highlightTimeoutRef.current) {
          clearTimeout(highlightTimeoutRef.current);
        }
        highlightTimeoutRef.current = setTimeout(
          () => setHighlightedMessageId(null),
          1800,
        );
      }

      pendingReplyScrollRef.current = null;
    }
  }, [messages]);

  useEffect(() => {
    if (messagesLoading || !shouldAutoScrollRef.current) return undefined;

    const animationFrame = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
      shouldAutoScrollRef.current = false;
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [messages, messagesLoading]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  const handleMessageChange = (event) => {
    const value = event.target.value;
    setNewMessage(value);

    if (!partner || !socketRef.current) return;

    socketRef.current.emit("typing", {
      receiverId: partner.id,
      isTyping: value.trim().length > 0,
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    if (value.trim()) {
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current?.emit("typing", {
          receiverId: partnerRef.current?.id,
          isTyping: false,
        });
      }, 1200);
    }
  };

  const handleSendMessage = (event) => {
    event.preventDefault();
    const content = newMessage.trim();

    if (!content || !partner || !socketRef.current || !socketConnected) return;

    socketRef.current.emit("send_message", {
      receiverId: partner.id,
      content: content.slice(0, MAX_MESSAGE_LENGTH),
      replyToMessageId: replyTarget?.id || null,
    });
    socketRef.current.emit("typing", {
      receiverId: partner.id,
      isTyping: false,
    });

    setNewMessage("");
    setReplyTarget(null);
  };

  const handleReaction = (messageId, emoji) => {
    socketRef.current?.emit("react_message", { messageId, emoji });
    setActiveReactionMenuId(null);
  };

  const revealLoadedMessage = (messageId) => {
    const normalizedMessageId = Number(messageId);
    const originalMessage = messageListRef.current?.querySelector(
      `[data-message-id="${normalizedMessageId}"]`,
    );
    if (!originalMessage) return false;

    originalMessage.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(normalizedMessageId);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = setTimeout(
      () => setHighlightedMessageId(null),
      1800,
    );
    return true;
  };

  const handleReplyReferenceClick = async (messageId) => {
    const targetMessageId = Number(messageId);
    if (
      !Number.isInteger(targetMessageId) ||
      replyNavigationRef.current ||
      loadingOlderMessagesRef.current
    ) {
      return;
    }
    if (revealLoadedMessage(targetMessageId)) return;

    if (!partner || !hasOlderMessages || !olderMessagesCursor) return;

    replyNavigationRef.current = true;
    setReplyNavigationMessageId(targetMessageId);
    setOlderMessagesError("");

    let cursor = olderMessagesCursor;
    let hasMore = hasOlderMessages;
    let collectedMessages = [];
    const collectedMessageIds = new Set();

    try {
      while (hasMore && cursor) {
        const response = await API.get(`/messages/${partner.id}`, {
          params: { before: cursor, limit: MESSAGE_PAGE_SIZE },
        });

        if (Number(partnerRef.current?.id) !== Number(partner.id)) return;

        const pageMessages = Array.isArray(response.data)
          ? response.data
          : response.data.messages;
        const uniquePageMessages = pageMessages.filter((message) => {
          const id = String(message.id);
          if (
            knownMessageIdsRef.current.has(id) ||
            collectedMessageIds.has(id)
          ) {
            return false;
          }
          collectedMessageIds.add(id);
          return true;
        });

        collectedMessages = [...uniquePageMessages, ...collectedMessages];
        const foundTarget = pageMessages.some(
          (message) => Number(message.id) === targetMessageId,
        );
        const nextCursor = Array.isArray(response.data)
          ? null
          : response.data.nextCursor;
        hasMore = Array.isArray(response.data) ? false : response.data.hasMore;

        if (foundTarget) {
          collectedMessages.forEach((message) =>
            knownMessageIdsRef.current.add(String(message.id)),
          );
          pendingReplyScrollRef.current = targetMessageId;
          shouldAutoScrollRef.current = false;
          setHasOlderMessages(hasMore);
          setOlderMessagesCursor(nextCursor);
          setMessages((currentMessages) => [
            ...collectedMessages,
            ...currentMessages,
          ]);
          return;
        }

        if (!nextCursor || String(nextCursor) === String(cursor)) break;
        cursor = nextCursor;
      }

      setOlderMessagesError("The original message is no longer available.");
    } catch (error) {
      console.error("Failed to find original message", error);
      setOlderMessagesError("Couldn't load the original message.");
    } finally {
      replyNavigationRef.current = false;
      setReplyNavigationMessageId(null);
    }
  };

  const loadOlderMessages = async () => {
    if (
      !partner ||
      !hasOlderMessages ||
      !olderMessagesCursor ||
      loadingOlderMessagesRef.current ||
      replyNavigationRef.current
    ) {
      return;
    }

    const messageList = messageListRef.current;
    loadingOlderMessagesRef.current = true;
    setOlderMessagesLoading(true);
    setOlderMessagesError("");

    try {
      const response = await API.get(`/messages/${partner.id}`, {
        params: {
          before: olderMessagesCursor,
          limit: MESSAGE_PAGE_SIZE,
        },
      });

      if (Number(partnerRef.current?.id) !== Number(partner.id)) return;

      const olderMessages = Array.isArray(response.data)
        ? response.data
        : response.data.messages;
      const uniqueOlderMessages = olderMessages.filter(
        (message) => !knownMessageIdsRef.current.has(String(message.id)),
      );

      if (uniqueOlderMessages.length > 0 && messageList) {
        pendingScrollAdjustmentRef.current = {
          scrollHeight: messageList.scrollHeight,
          scrollTop: messageList.scrollTop,
        };
        uniqueOlderMessages.forEach((message) =>
          knownMessageIdsRef.current.add(String(message.id)),
        );
        shouldAutoScrollRef.current = false;
        setMessages((currentMessages) => [
          ...uniqueOlderMessages,
          ...currentMessages,
        ]);
      }

      setHasOlderMessages(
        Array.isArray(response.data) ? false : response.data.hasMore,
      );
      setOlderMessagesCursor(
        Array.isArray(response.data) ? null : response.data.nextCursor,
      );
    } catch (error) {
      console.error("Failed to fetch earlier messages", error);
      setOlderMessagesError("Couldn't load earlier messages.");
    } finally {
      loadingOlderMessagesRef.current = false;
      setOlderMessagesLoading(false);
    }
  };

  const handleMessageListScroll = (event) => {
    const messageList = event.currentTarget;
    const distanceFromBottom =
      messageList.scrollHeight -
      messageList.scrollTop -
      messageList.clientHeight;
    const nextIsNearBottom = distanceFromBottom < 96;

    isNearBottomRef.current = nextIsNearBottom;
    setIsNearBottom(nextIsNearBottom);

    if (nextIsNearBottom) {
      setUnreadMessageCount(0);
    }
  };

  const scrollToLatestMessage = () => {
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: "smooth",
    });
    isNearBottomRef.current = true;
    setIsNearBottom(true);
    setUnreadMessageCount(0);
  };

  if (partnerLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#130507] text-rose-100/70">
        <div className="chat-intro flex flex-col items-center gap-3">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-[1.6rem] bg-rose-500/10">
            <Heart className="h-6 w-6 text-rose-300" />
            <LoaderCircle className="absolute h-12 w-12 animate-spin text-rose-400/40" />
          </div>
          <p className="text-sm">Opening your conversation...</p>
        </div>
      </div>
    );
  }

  if (partnerError || !partner) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#130507] p-5 text-rose-50">
        <div className="chat-intro w-full max-w-sm rounded-[2rem] border border-rose-900/50 bg-[#22070c] p-7 text-center shadow-2xl shadow-black/30">
          {partnerError ? (
            <AlertCircle className="mx-auto mb-4 h-8 w-8 text-red-300" />
          ) : (
            <Heart className="mx-auto mb-4 h-8 w-8 text-rose-300" />
          )}
          <h1 className="text-xl font-extrabold">
            {partnerError ? "Couldn't open your chat" : "Waiting for your person"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-rose-100/60">
            {partnerError
              ? partnerError
              : "Create the second account, then refresh this page to begin your private conversation."}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => setPartnerReloadKey((key) => key + 1)}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-pink-600 px-5 py-2.5 text-sm font-bold text-white"
            >
              <RefreshCw className="h-4 w-4" /> Check again
            </button>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-full bg-[#2a0910] px-5 py-2.5 text-sm font-bold text-rose-100"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-[#130507] text-rose-50 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="ambient-glow absolute -left-20 top-10 h-64 w-64 rounded-full bg-rose-700/10 blur-3xl" />
        <div className="ambient-glow ambient-glow-delayed absolute -right-20 bottom-20 h-72 w-72 rounded-full bg-pink-600/10 blur-3xl" />
      </div>

      <main className="chat-shell relative mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden border-x border-rose-900/20 bg-[#130507]/70">
        <header className="relative z-10 border-b border-rose-900/60 bg-[#130507]/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="partner-avatar relative flex h-11 w-11 shrink-0 items-center justify-center rounded-3xl border border-rose-300/20 bg-gradient-to-br from-rose-500 to-red-500 text-sm font-extrabold text-white shadow-lg shadow-rose-900/30">
                {partner.username.charAt(0).toUpperCase()}
                <span
                  className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#130507] transition-colors duration-500 ${partnerIsOnline ? "bg-emerald-400" : "bg-rose-100/30"
                    }`}
                />
              </div>

              <div className="min-w-0">
                <h1 className="truncate text-sm font-extrabold text-rose-50 sm:text-base">
                  {partner.username != null ? "Love ❤️" : null}
                </h1>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-rose-100/55">
                  {isPartnerTyping ? (
                    <span className="typing-enter font-semibold text-rose-200">
                      {partner.username} typing...
                    </span>
                  ) : (
                    <span>{partnerIsOnline ? "online" : "offline"}</span>
                  )}
                  <span aria-hidden="true">•</span>
                  <span>{partner.username}</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-900/50 bg-[#2a0910] text-rose-100/70 transition hover:border-rose-700/60 hover:text-rose-50 active:scale-95"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {!socketConnected ? (
          <div className="connection-banner relative z-10 flex items-center justify-center gap-2 border-b border-amber-400/20 bg-amber-500/10 px-4 py-2 text-center text-xs font-semibold text-amber-100">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            Reconnecting... Your message stays here until you're back.
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1">
          <section
            ref={messageListRef}
            onScroll={handleMessageListScroll}
            className="h-full overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 sm:py-6"
          >
            {messagesLoading ? (
              <div className="flex h-full min-h-56 items-center justify-center gap-2 text-sm text-rose-100/60">
                <LoaderCircle className="h-5 w-5 animate-spin" />
                Loading your messages...
              </div>
            ) : messagesError ? (
              <div className="chat-intro flex h-full min-h-56 flex-col items-center justify-center gap-3 text-center text-rose-100/70">
                <AlertCircle className="h-7 w-7 text-red-300" />
                <p>{messagesError}</p>
                <button
                  type="button"
                  onClick={() => setHistoryReloadKey((key) => key + 1)}
                  className="inline-flex items-center gap-2 rounded-full bg-[#2a0910] px-4 py-2 font-bold text-rose-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </button>
              </div>
            ) : messages.length === 0 ? (
              <div className="chat-intro flex h-full min-h-56 flex-col items-center justify-center px-6 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[1.75rem] border border-rose-900/40 bg-[#2a0910] text-rose-200 shadow-xl shadow-black/20">
                  <MessageSquare className="h-7 w-7" />
                </div>
                <h2 className="text-lg font-extrabold text-rose-50">
                  Your private space is ready
                </h2>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-rose-100/55">
                  Send the first little hello. This conversation belongs to the two
                  of you.
                </p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {hasOlderMessages || olderMessagesError ? (
                  <div className="flex flex-col items-center gap-2 pb-2">
                    {hasOlderMessages ? (
                      <button
                        type="button"
                        onClick={loadOlderMessages}
                        disabled={olderMessagesLoading}
                        className="inline-flex items-center gap-2 rounded-full border border-rose-900/40 bg-[#22070c]/90 px-4 py-2 text-xs font-bold text-rose-100/70 transition hover:border-rose-600/50 hover:text-rose-50 disabled:cursor-wait disabled:opacity-60"
                      >
                        {olderMessagesLoading ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        {olderMessagesLoading
                          ? "Loading earlier messages..."
                          : "Load earlier messages"}
                      </button>
                    ) : null}
                    {olderMessagesError ? (
                      <p className="text-xs text-red-200/80">
                        {olderMessagesError}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {messages.map((message, index) => {
                  const isMe =
                    Number(message.sender_id) === Number(user.id);
                  const reactionSummary = getReactionSummary(message);
                  const isReactionMenuOpen =
                    Number(activeReactionMenuId) === Number(message.id);
                  const showDay = isDifferentDay(message, messages[index - 1]);
                  const isLastOutgoing =
                    isMe &&
                    Number(lastOutgoingMessage?.id) === Number(message.id);

                  return (
                    <div key={message.id}>
                      {showDay ? (
                        <div className="day-divider my-5 flex items-center gap-3">
                          <span className="h-px flex-1 bg-rose-900/30" />
                          <span className="rounded-full border border-rose-900/30 bg-[#22070c]/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-rose-100/45">
                            {formatConversationDay(message.created_at)}
                          </span>
                          <span className="h-px flex-1 bg-rose-900/30" />
                        </div>
                      ) : null}

                      <div
                        className={`message-enter flex ${isMe ? "justify-end" : "justify-start"
                          }`}
                        style={{
                          animationDelay: `${Math.min(index * 18, 140)}ms`,
                        }}
                      >
                        <div
                          data-message-id={message.id}
                          className={`max-w-[88%] scroll-my-24 rounded-[1.6rem] transition duration-500 sm:max-w-[72%] ${Number(highlightedMessageId) === Number(message.id)
                            ? "bg-rose-300/10 ring-2 ring-rose-300/60 ring-offset-4 ring-offset-[#130507]"
                            : ""
                            }`}
                        >
                          <div
                            className={`rounded-[1.55rem] px-4 py-3 text-sm leading-relaxed shadow-lg sm:text-[15px] ${isMe
                              ? "rounded-br-md border border-rose-500/30 bg-gradient-to-br from-rose-600 to-pink-700 text-white shadow-rose-950/20"
                              : "rounded-bl-md border border-rose-900/50 bg-[#2a0910] text-rose-50 shadow-black/20"
                              }`}
                          >
                            {message.reply_to_message_id ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleReplyReferenceClick(
                                    message.reply_to_message_id,
                                  )
                                }
                                disabled={replyNavigationMessageId !== null}
                                aria-label="Go to original message"
                                className="mb-2 block w-full rounded-[1rem] border border-white/10 bg-black/15 p-2 text-left text-xs text-rose-100/70 transition hover:border-white/20 hover:bg-black/25 disabled:cursor-wait"
                              >
                                <span className="mb-1 flex items-center gap-1.5 font-semibold text-rose-50">
                                  {Number(replyNavigationMessageId) ===
                                    Number(message.reply_to_message_id) ? (
                                    <LoaderCircle className="h-3 w-3 animate-spin" />
                                  ) : null}
                                  Reply to{" "}
                                  {Number(message.reply_to_sender_id) ===
                                  Number(user.id)
                                    ? "you"
                                    : message.reply_to_sender_username || "message"}
                                </span>
                                <span className="block truncate">
                                  {message.reply_to_content || "Shared a message"}
                                </span>
                              </button>
                            ) : null}
                            <div className="whitespace-pre-wrap break-words">
                              {message.content}
                            </div>
                          </div>

                          <div
                            className={`mt-1.5 flex flex-wrap items-center gap-1.5 px-1 ${isMe ? "justify-end" : "justify-start"
                              }`}
                          >
                            {reactionSummary.map(({ emoji, count }) => (
                              <span
                                key={`${message.id}-${emoji}`}
                                className="reaction-pop rounded-full border border-rose-900/40 bg-[#22070c] px-2 py-1 text-[11px] font-semibold text-rose-50"
                              >
                                {emoji} {count}
                              </span>
                            ))}

                            <button
                              type="button"
                              onClick={() =>
                                setActiveReactionMenuId((currentId) =>
                                  Number(currentId) === Number(message.id)
                                    ? null
                                    : message.id,
                                )
                              }
                              aria-label={
                                isReactionMenuOpen
                                  ? "Close reaction picker"
                                  : "React to message"
                              }
                              className="message-action inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-900/30 bg-[#22070c]/80 text-rose-100/60 transition hover:border-rose-600/50 hover:text-rose-50 active:scale-90"
                            >
                              {isReactionMenuOpen ? (
                                <X className="h-3.5 w-3.5" />
                              ) : (
                                <Smile className="h-3.5 w-3.5" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setReplyTarget(message);
                                setActiveReactionMenuId(null);
                                composerRef.current?.focus();
                              }}
                              aria-label="Reply to message"
                              className="message-action inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-900/30 bg-[#22070c]/80 text-rose-100/60 transition hover:border-rose-600/50 hover:text-rose-50 active:scale-90"
                            >
                              <Reply className="h-3.5 w-3.5" />
                            </button>

                            <span className="px-1 text-[10px] text-rose-100/45">
                              {formatMessageTime(message.created_at)}
                            </span>

                            {isLastOutgoing ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-rose-100/50">
                                <CheckCheck className="h-3.5 w-3.5" />
                                {seenMessageId >= Number(message.id)
                                  ? "Seen"
                                  : "Sent"}
                              </span>
                            ) : null}
                          </div>

                          {isReactionMenuOpen ? (
                            <div
                              className={`reaction-picker-enter mt-2 flex gap-1.5 px-1 ${isMe ? "justify-end" : "justify-start"
                                }`}
                            >
                              {REACTION_OPTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => handleReaction(message.id, emoji)}
                                  className="flex h-9 w-9 items-center justify-center rounded-full border border-rose-900/40 bg-[#2a0910] text-base shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:border-rose-500/50 active:scale-90"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {isPartnerTyping ? (
              <div className="typing-enter mt-3 flex justify-start px-1">
                <div className="inline-flex items-center gap-1 rounded-full border border-rose-900/40 bg-[#2a0910] px-3 py-2">
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-rose-300" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-rose-300" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-rose-300" />
                </div>
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </section>

          {!isNearBottom && (unreadMessageCount > 0 || isPartnerTyping) ? (
            <button
              type="button"
              onClick={scrollToLatestMessage}
              aria-live="polite"
              className="new-message-pill absolute bottom-4 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-rose-300/25 bg-[#3a0a13]/95 px-4 py-2.5 text-xs font-extrabold text-rose-50 shadow-xl shadow-black/40 backdrop-blur-xl transition hover:border-rose-300/45 hover:bg-[#470d18] active:scale-95"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white">
                <ChevronDown className="h-3.5 w-3.5" />
              </span>
              {unreadMessageCount > 0
                ? `${unreadMessageCount} new ${unreadMessageCount === 1 ? "message" : "messages"}`
                : `${partner.username} is typing...`}
            </button>
          ) : null}
        </div>

        <form
          onSubmit={handleSendMessage}
          className="relative border-t border-rose-900/60 bg-[#130507]/90 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:p-4"
        >
          <div className="rounded-[1.7rem] border border-rose-900/50 bg-[#22070c]/90 p-2 shadow-inner shadow-black/15 transition focus-within:border-rose-500/50 focus-within:bg-[#2a0910]">
            {replyTarget ? (
              <div className="composer-reply-enter mb-2 flex items-start justify-between gap-2 rounded-[1.2rem] border border-rose-900/40 bg-[#1a0509]/80 p-3 text-sm text-rose-100/80">
                <div className="min-w-0">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-rose-200/60">
                    Replying to {replyTarget.sender_username || "message"}
                  </div>
                  <div className="truncate">{replyTarget.content}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTarget(null)}
                  aria-label="Cancel reply"
                  className="rounded-full p-1 text-rose-100/60 transition hover:bg-[#2a0910] hover:text-rose-50 active:scale-90"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            <div className="flex items-end gap-2 sm:gap-3">
              <div className="hidden h-10 w-10 items-center justify-center rounded-2xl bg-[#2a0910] text-rose-200 sm:flex">
                <Heart className="heart-beat h-4 w-4" />
              </div>
              <textarea
                ref={composerRef}
                rows={1}
                value={newMessage}
                onChange={handleMessageChange}
                maxLength={MAX_MESSAGE_LENGTH}
                placeholder={`Message ${partner.username}...`}
                className="min-h-12 max-h-32 flex-1 resize-none rounded-[1.2rem] border-0 bg-transparent px-3 py-3 text-base text-rose-50 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 placeholder:text-rose-200/40 sm:px-4 sm:text-sm"
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    handleSendMessage(event);
                  }
                }}
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || !socketConnected}
                aria-label="Send message"
                className="send-button inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.2rem] bg-gradient-to-r from-rose-500 via-pink-500 to-red-500 font-bold text-white shadow-lg shadow-rose-900/30 transition hover:brightness-110 active:scale-90 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>

          {newMessage.length > 1800 ? (
            <p className="mt-1 px-2 text-right text-[10px] text-rose-100/50">
              {newMessage.length}/{MAX_MESSAGE_LENGTH}
            </p>
          ) : null}
        </form>
      </main>
    </div>
  );
}
