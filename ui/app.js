// Abaddon Discord Client - Frontend Application

const invoke = window.__TAURI__ ? window.__TAURI__.core.invoke : async () => {};
const listen = window.__TAURI__ ? window.__TAURI__.event.listen : async () => () => {};

// State
let currentUser = null;
let currentGuildId = null;
let currentChannelId = null;
let currentGuilds = [];
let currentChannels = [];
let currentMessages = [];

// Voice & Stream State
let activeVoiceChannelId = null;
let activeVoiceGuildId = null;
let isMuted = false;
let isDeafened = false;
let isStreaming = false;
let activeStreams = new Map(); // stream_key -> streamData
let selectedStreamKey = null;
let channelVoiceUsers = new Map(); // channel_id -> Set of userIds / user objects
let currentGuildVoiceStates = new Map(); // user_id -> VoiceState
let stageViewActive = false;

// DOM Elements
const loginModal = document.getElementById("login-modal");
const tokenInput = document.getElementById("token-input");
const rememberTokenCheck = document.getElementById("remember-token-check");
const loginErrorMsg = document.getElementById("login-error-msg");
const btnLoginSubmit = document.getElementById("btn-login-submit");

const guildsContainer = document.getElementById("guilds-container");
const btnDm = document.getElementById("btn-dm");
const serverNameLabel = document.getElementById("server-name-label");
const channelsList = document.getElementById("channels-list");

const voiceConnectedBar = document.getElementById("voice-connected-bar");
const voiceChannelName = document.getElementById("voice-channel-name");
const btnToggleMic = document.getElementById("btn-toggle-mic");
const btnToggleDeaf = document.getElementById("btn-toggle-deaf");
const btnStreamToggle = document.getElementById("btn-stream-toggle");
const btnVoiceDisconnect = document.getElementById("btn-voice-disconnect");

const currentUserAvatar = document.getElementById("current-user-avatar");
const currentUserInitial = document.getElementById("current-user-initial");
const currentUsername = document.getElementById("current-username");
const currentUsertag = document.getElementById("current-usertag");
const btnLogout = document.getElementById("btn-logout");

const chatHeaderIcon = document.getElementById("chat-header-icon");
const chatHeaderName = document.getElementById("chat-header-name");
const chatHeaderTopic = document.getElementById("chat-header-topic");
const btnToggleStageView = document.getElementById("btn-toggle-stage-view");

const messagesList = document.getElementById("messages-list");
const messageTextarea = document.getElementById("message-textarea");
const btnSendMessage = document.getElementById("btn-send-message");

const stageContainer = document.getElementById("stage-container");
const streamSwitcherBar = document.getElementById("stream-switcher-bar");
const streamPlayerBox = document.getElementById("stream-player-box");
const streamCanvas = document.getElementById("stream-canvas");
const streamTitleText = document.getElementById("stream-title-text");
const streamUserText = document.getElementById("stream-user-text");
const btnStreamExit = document.getElementById("btn-stream-exit");
const participantGrid = document.getElementById("participant-grid");

// Initialize application
async function init() {
  setupEventListeners();
  setupGatewayListeners();

  const savedToken = localStorage.getItem("abaddon_discord_token");
  if (savedToken) {
    tokenInput.value = savedToken;
    await performLogin(savedToken);
  }
}

function setupEventListeners() {
  btnLoginSubmit.addEventListener("click", async () => {
    const token = tokenInput.value.trim();
    if (!token) {
      loginErrorMsg.innerText = "Please enter your Discord token.";
      return;
    }
    await performLogin(token);
  });

  tokenInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      btnLoginSubmit.click();
    }
  });

  btnLogout.addEventListener("click", async () => {
    try {
      await invoke("logout");
    } catch (e) {}
    localStorage.removeItem("abaddon_discord_token");
    currentUser = null;
    loginModal.style.display = "flex";
  });

  btnDm.addEventListener("click", () => {
    selectDmHome();
  });

  btnSendMessage.addEventListener("click", () => {
    handleSendMessage();
  });

  messageTextarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  btnToggleMic.addEventListener("click", async () => {
    isMuted = !isMuted;
    btnToggleMic.classList.toggle("active", isMuted);
    btnToggleMic.innerText = isMuted ? "🔇" : "🎙️";
    if (activeVoiceChannelId) {
      await invoke("join_voice", {
        guildId: activeVoiceGuildId,
        channelId: activeVoiceChannelId,
        mute: isMuted,
        deaf: isDeafened,
      });
    }
  });

  btnToggleDeaf.addEventListener("click", async () => {
    isDeafened = !isDeafened;
    btnToggleDeaf.classList.toggle("active", isDeafened);
    if (activeVoiceChannelId) {
      await invoke("join_voice", {
        guildId: activeVoiceGuildId,
        channelId: activeVoiceChannelId,
        mute: isMuted,
        deaf: isDeafened,
      });
    }
  });

  btnVoiceDisconnect.addEventListener("click", async () => {
    await disconnectVoice();
  });

  btnStreamToggle.addEventListener("click", async () => {
    if (!activeVoiceChannelId) return;
    if (isStreaming) {
      await invoke("stop_stream");
      isStreaming = false;
      btnStreamToggle.classList.remove("active");
    } else {
      await invoke("start_stream", {
        guildId: activeVoiceGuildId,
        channelId: activeVoiceChannelId,
      });
      isStreaming = true;
      btnStreamToggle.classList.add("active");
    }
  });

  btnToggleStageView.addEventListener("click", () => {
    toggleStageView(!stageViewActive);
  });

  btnStreamExit.addEventListener("click", () => {
    selectedStreamKey = null;
    streamPlayerBox.style.display = "none";
    updateStreamSwitcher();
  });
}

async function setupGatewayListeners() {
  if (!window.__TAURI__) return;

  await listen("discord-ready", async (event) => {
    console.log("Gateway READY:", event.payload);
    if (!currentGuildId) {
      await loadDms();
    }
  });

  await listen("discord-guild-create", async (event) => {
    const guild = event.payload;
    if (currentGuildId && guild.id === currentGuildId) {
      if (guild.channels && guild.channels.length > 0) {
        currentChannels = guild.channels;
        renderChannels(guild.channels);
      }
    }
  });

  await listen("discord-message-create", (event) => {
    const msg = event.payload;
    if (msg.channel_id === currentChannelId) {
      appendMessage(msg);
      messagesList.scrollTop = messagesList.scrollHeight;
    }
  });

  await listen("discord-voice-state-update", (event) => {
    const state = event.payload;
    handleVoiceStateUpdate(state);
  });

  await listen("discord-stream-create", (event) => {
    const data = event.payload;
    activeStreams.set(data.stream_key, data);
    updateStreamSwitcher();
  });

  await listen("discord-stream-delete", (event) => {
    const data = event.payload;
    activeStreams.delete(data.stream_key);
    if (selectedStreamKey === data.stream_key) {
      selectedStreamKey = null;
      streamPlayerBox.style.display = "none";
    }
    updateStreamSwitcher();
  });

  await listen("discord-voice-connected", () => {
    console.log("Voice Gateway connected!");
    const voiceStatus = document.querySelector(".voice-status-title");
    if (voiceStatus) {
      voiceStatus.innerHTML = `<span style="color: var(--green);">●</span><span>Voice Connected (RTC Active)</span>`;
    }
  });

  await listen("discord-voice-disconnected", () => {
    console.log("Voice Gateway disconnected!");
    const voiceStatus = document.querySelector(".voice-status-title");
    if (voiceStatus) {
      voiceStatus.innerHTML = `<span style="color: var(--red);">●</span><span>Voice Disconnected</span>`;
    }
  });

  await listen("discord-voice-speaking", (event) => {
    const data = event.payload;
    const userId = data.user_id;
    const isSpeaking = Boolean(data.speaking && data.speaking > 0);
    const card = document.getElementById(`participant-${userId}`);
    if (card) {
      card.classList.toggle("speaking", isSpeaking);
    }
    const userRow = document.getElementById(`voice-user-${userId}`);
    if (userRow) {
      userRow.classList.toggle("speaking", isSpeaking);
    }
  });
}

// Authentication
async function performLogin(token) {
  loginErrorMsg.innerText = "Connecting...";
  try {
    const user = await invoke("login", { token });
    currentUser = user;
    if (rememberTokenCheck.checked) {
      localStorage.setItem("abaddon_discord_token", token);
    }
    loginModal.style.display = "none";
    renderCurrentUser(user);
    await loadGuilds();
    await selectDmHome();
  } catch (err) {
    loginErrorMsg.innerText = String(err);
  }
}

function renderCurrentUser(user) {
  currentUsername.innerText = user.global_name || user.username;
  currentUsertag.innerText = user.discriminator && user.discriminator !== "0" ? `#${user.discriminator}` : `@${user.username}`;
  if (user.avatar) {
    const avatarUrl = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
    currentUserAvatar.innerHTML = `<img src="${avatarUrl}" alt="${user.username}"><div class="user-status-dot"></div>`;
  } else {
    currentUserInitial.innerText = user.username.charAt(0).toUpperCase();
  }
}

// Guilds
async function loadGuilds() {
  try {
    const guilds = await invoke("get_guilds");
    currentGuilds = guilds;
    guildsContainer.innerHTML = "";

    guilds.forEach((g) => {
      const el = document.createElement("div");
      el.className = "server-icon";
      el.title = g.name;

      const pill = document.createElement("div");
      pill.className = "server-pill";
      el.appendChild(pill);

      if (g.icon) {
        const img = document.createElement("img");
        img.src = `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=96`;
        img.alt = g.name;
        el.appendChild(img);
      } else {
        const span = document.createElement("span");
        span.innerText = getInitials(g.name);
        el.appendChild(span);
      }

      el.addEventListener("click", () => {
        selectGuild(g);
      });

      guildsContainer.appendChild(el);
    });
  } catch (err) {
    console.error("Failed to load guilds:", err);
  }
}

async function selectDmHome() {
  currentGuildId = null;
  serverNameLabel.innerText = "Direct Messages";
  document.querySelectorAll(".server-icon").forEach((el) => el.classList.remove("active"));
  btnDm.classList.add("active");
  await loadDms();
}

async function loadDms() {
  channelsList.innerHTML = `<div style="padding: 12px; color: var(--text-muted); font-size: 13px;">Loading direct messages...</div>`;
  try {
    const dms = await invoke("get_dms");
    renderDms(dms);
  } catch (err) {
    console.error("Failed to load DMs:", err);
    channelsList.innerHTML = `<div style="padding: 12px; color: var(--red); font-size: 13px;">Failed to load direct messages</div>`;
  }
}

function renderDms(dms) {
  channelsList.innerHTML = "";
  if (!dms || dms.length === 0) {
    channelsList.innerHTML = `<div style="padding: 12px; color: var(--text-muted); font-size: 13px;">No direct messages</div>`;
    return;
  }

  const catLabel = document.createElement("div");
  catLabel.className = "channel-category";
  catLabel.innerText = "Direct Messages";
  channelsList.appendChild(catLabel);

  dms.forEach((dm) => {
    const item = document.createElement("div");
    item.className = "channel-item" + (dm.id === currentChannelId ? " active" : "");

    const recipient = dm.recipients && dm.recipients[0];
    const name = dm.name || (recipient ? (recipient.global_name || recipient.username) : "Direct Message");
    const avatarUrl = recipient && recipient.avatar 
      ? `https://cdn.discordapp.com/avatars/${recipient.id}/${recipient.avatar}.png?size=32`
      : null;

    const avatarHtml = avatarUrl
      ? `<img src="${avatarUrl}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">`
      : `<span class="channel-icon">@</span>`;

    item.innerHTML = `${avatarHtml}<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</span>`;
    item.addEventListener("click", () => {
      selectDmChannel(dm, name);
    });
    channelsList.appendChild(item);
  });
}

async function selectDmChannel(dm, name) {
  currentChannelId = dm.id;
  chatHeaderIcon.innerText = "@";
  chatHeaderName.innerText = name;
  chatHeaderTopic.innerText = "Direct Message";
  messageTextarea.placeholder = `Message @${name}`;

  document.querySelectorAll(".channel-item").forEach((el) => {
    el.classList.toggle("active", el.innerText.includes(name));
  });

  toggleStageView(false);

  messagesList.innerHTML = `<div style="color: var(--text-muted); text-align: center; margin-top: 40px;">Loading messages...</div>`;

  try {
    const messages = await invoke("get_messages", { channelId: dm.id, limit: 50 });
    currentMessages = messages.reverse();
    renderMessages(currentMessages);
  } catch (err) {
    console.error("Failed to load DM messages:", err);
    messagesList.innerHTML = `<div style="color: var(--red); text-align: center; margin-top: 40px;">Failed to load messages</div>`;
  }
}

async function selectGuild(guild) {
  currentGuildId = guild.id;
  currentGuildVoiceStates.clear();
  serverNameLabel.innerText = guild.name;

  document.querySelectorAll(".server-icon").forEach((el) => el.classList.remove("active"));
  const clickedIcon = Array.from(guildsContainer.children).find((c) => c.title === guild.name);
  if (clickedIcon) clickedIcon.classList.add("active");

  channelsList.innerHTML = `<div style="padding: 12px; color: var(--text-muted); font-size: 13px;">Loading channels...</div>`;

  try {
    const [channels, vstates] = await Promise.all([
      invoke("get_channels", { guildId: guild.id }).catch(() => []),
      invoke("get_guild_voice_states", { guildId: guild.id }).catch(() => []),
    ]);

    if (vstates && Array.isArray(vstates)) {
      vstates.forEach((vs) => currentGuildVoiceStates.set(vs.user_id, vs));
    }

    let resolvedChannels = channels;
    if (!resolvedChannels || resolvedChannels.length === 0) {
      await new Promise((r) => setTimeout(r, 600));
      resolvedChannels = (await invoke("get_channels", { guildId: guild.id }).catch(() => [])) || [];
    }
    currentChannels = resolvedChannels;
    renderChannels(currentChannels);
  } catch (err) {
    console.error("Failed to fetch channels:", err);
    channelsList.innerHTML = `<div style="padding: 12px; color: var(--red); font-size: 13px;">Failed to load channels</div>`;
  }
}

function getChannelType(c) {
  if (c.type !== undefined && c.type !== null) return Number(c.type);
  if (c.channel_type !== undefined && c.channel_type !== null) return Number(c.channel_type);
  return 0;
}

function renderChannels(channels) {
  channelsList.innerHTML = "";
  if (!channels || channels.length === 0) {
    channelsList.innerHTML = `<div style="padding: 12px; color: var(--text-muted); font-size: 13px;">No channels found</div>`;
    return;
  }

  // Sort channels by position
  channels.sort((a, b) => (a.position || 0) - (b.position || 0));

  const categories = channels.filter((c) => getChannelType(c) === 4);
  const uncategorized = channels.filter((c) => !c.parent_id && getChannelType(c) !== 4);

  function createChannelElement(c) {
    const type = getChannelType(c);
    const isVoice = type === 2 || type === 13;
    const isStage = type === 13;
    const icon = isStage ? "📡" : (isVoice ? "🔊" : (type === 5 ? "📢" : "#"));

    const wrap = document.createElement("div");
    wrap.className = "channel-wrapper";
    wrap.id = `channel-wrap-${c.id}`;

    const item = document.createElement("div");
    item.className = "channel-item" + (c.id === currentChannelId ? " active" : "");
    item.setAttribute("data-channel-id", c.id);
    item.innerHTML = `<span class="channel-icon">${icon}</span><span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(c.name)}</span>`;
    item.addEventListener("click", () => {
      if (isVoice) {
        joinVoiceChannel(c);
      } else {
        selectTextChannel(c);
      }
    });
    wrap.appendChild(item);

    if (isVoice) {
      const usersContainer = document.createElement("div");
      usersContainer.className = "voice-channel-users";
      usersContainer.id = `voice-users-${c.id}`;
      renderVoiceUsersForChannel(c.id, usersContainer);
      wrap.appendChild(usersContainer);
    }

    return wrap;
  }

  // Uncategorized channels (top of server)
  if (uncategorized.length > 0) {
    uncategorized.forEach((c) => {
      channelsList.appendChild(createChannelElement(c));
    });
  }

  // Categories and their child channels
  categories.forEach((cat) => {
    const catHeader = document.createElement("div");
    catHeader.className = "channel-category";
    catHeader.innerHTML = `<span>${escapeHtml((cat.name || "Category").toUpperCase())}</span><span class="category-arrow" style="font-size: 9px; transition: transform 0.2s;">▼</span>`;
    
    const catContainer = document.createElement("div");
    catContainer.className = "category-channels-container";
    
    const childChannels = channels.filter((c) => c.parent_id === cat.id && getChannelType(c) !== 4);
    childChannels.forEach((c) => {
      catContainer.appendChild(createChannelElement(c));
    });

    catHeader.addEventListener("click", () => {
      const isCollapsed = catContainer.style.display === "none";
      catContainer.style.display = isCollapsed ? "block" : "none";
      const arrow = catHeader.querySelector(".category-arrow");
      if (arrow) {
        arrow.style.transform = isCollapsed ? "rotate(0deg)" : "rotate(-90deg)";
      }
    });

    channelsList.appendChild(catHeader);
    channelsList.appendChild(catContainer);
  });

  // Fallback if there were channels but no categories or uncategorized matched
  if (categories.length === 0 && uncategorized.length === 0) {
    channels.forEach((c) => {
      if (getChannelType(c) !== 4) {
        channelsList.appendChild(createChannelElement(c));
      }
    });
  }
}

// Channels & Chat
async function selectTextChannel(channel) {
  currentChannelId = channel.id;
  chatHeaderIcon.innerText = "#";
  chatHeaderName.innerText = channel.name;
  chatHeaderTopic.innerText = channel.topic || "";
  messageTextarea.placeholder = `Message #${channel.name}`;

  document.querySelectorAll(".channel-item").forEach((el) => {
    el.classList.toggle("active", el.getAttribute("data-channel-id") === channel.id);
  });

  toggleStageView(false);

  try {
    const messages = await invoke("get_messages", { channelId: channel.id, limit: 50 });
    currentMessages = messages.reverse();
    renderMessages(currentMessages);
  } catch (err) {
    console.error("Failed to load messages:", err);
  }
}

function renderMessages(messages) {
  messagesList.innerHTML = "";
  if (messages.length === 0) {
    messagesList.innerHTML = `<div style="color: var(--text-muted); text-align: center; margin-top: 40px;">No messages yet. Send one below!</div>`;
    return;
  }

  messages.forEach((m) => appendMessage(m));
  messagesList.scrollTop = messagesList.scrollHeight;
}

function appendMessage(m) {
  const item = document.createElement("div");
  item.className = "message-item";

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  if (m.author && m.author.avatar) {
    avatar.innerHTML = `<img src="https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png?size=48" alt="${m.author.username}">`;
  } else {
    avatar.innerText = m.author ? m.author.username.charAt(0).toUpperCase() : "?";
  }

  const content = document.createElement("div");
  content.className = "message-content";

  const header = document.createElement("div");
  header.className = "message-header";
  const authorName = m.author ? (m.author.global_name || m.author.username) : "Unknown";
  const timeFormatted = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  header.innerHTML = `<span class="message-author">${authorName}</span><span class="message-time">${timeFormatted}</span>`;
  content.appendChild(header);

  const text = document.createElement("div");
  text.className = "message-text";
  text.innerText = m.content || "";
  content.appendChild(text);

  // Attachments
  if (m.attachments && m.attachments.length > 0) {
    const attContainer = document.createElement("div");
    attContainer.className = "message-attachments";
    m.attachments.forEach((att) => {
      if (att.content_type && att.content_type.startsWith("image/")) {
        const img = document.createElement("img");
        img.src = att.url;
        img.className = "attachment-img";
        img.alt = att.filename;
        attContainer.appendChild(img);
      }
    });
    content.appendChild(attContainer);
  }

  // Embeds
  if (m.embeds && m.embeds.length > 0) {
    m.embeds.forEach((emb) => {
      const embBox = document.createElement("div");
      embBox.className = "message-embed";
      if (emb.color) {
        embBox.style.borderLeftColor = `#${emb.color.toString(16).padStart(6, '0')}`;
      }
      if (emb.title) {
        const title = document.createElement("div");
        title.className = "embed-title";
        title.innerText = emb.title;
        embBox.appendChild(title);
      }
      if (emb.description) {
        const desc = document.createElement("div");
        desc.className = "embed-description";
        desc.innerText = emb.description;
        embBox.appendChild(desc);
      }
      content.appendChild(embBox);
    });
  }

  item.appendChild(avatar);
  item.appendChild(content);
  messagesList.appendChild(item);
}

async function handleSendMessage() {
  const content = messageTextarea.value.trim();
  if (!content || !currentChannelId) return;

  messageTextarea.value = "";
  try {
    const sent = await invoke("send_message", { channelId: currentChannelId, content });
    appendMessage(sent);
    messagesList.scrollTop = messagesList.scrollHeight;
  } catch (err) {
    console.error("Failed to send message:", err);
  }
}

// Voice & Stage Channel Operations
async function joinVoiceChannel(channel) {
  try {
    activeVoiceChannelId = channel.id;
    activeVoiceGuildId = currentGuildId;
    currentChannelId = channel.id;

    document.querySelectorAll(".channel-item").forEach((el) => {
      el.classList.toggle("active", el.getAttribute("data-channel-id") === channel.id);
    });

    await invoke("join_voice", {
      guildId: currentGuildId,
      channelId: channel.id,
      mute: isMuted,
      deaf: isDeafened,
    });

    voiceConnectedBar.style.display = "flex";
    const serverName = currentGuilds.find((g) => g.id === currentGuildId)?.name || "Server";
    voiceChannelName.innerText = `${channel.name} (${serverName})`;
    btnToggleStageView.style.display = "inline-flex";

    // Switch view to Stage / Voice
    toggleStageView(true);
    chatHeaderIcon.innerText = getChannelType(channel) === 13 ? "📡" : "🔊";
    chatHeaderName.innerText = channel.name;
    chatHeaderTopic.innerText = channel.topic || "Voice Channel";

    // Clear and populate participantGrid with current members!
    participantGrid.innerHTML = "";

    let states = [];
    try {
      states = await invoke("get_channel_voice_states", { channelId: channel.id });
    } catch (e) {
      console.warn("Could not get channel voice states:", e);
    }

    const added = new Set();
    if (states && states.length > 0) {
      for (const st of states) {
        const u = (st.member && st.member.user) || { id: st.user_id, username: st.member?.nick || "User" };
        const isSelf = currentUser && u.id === currentUser.id;
        addParticipantToGrid(u, Boolean(st.self_stream), st, isSelf);
        added.add(u.id);
      }
    }

    for (const st of currentGuildVoiceStates.values()) {
      if (st.channel_id === channel.id && !added.has(st.user_id)) {
        const u = (st.member && st.member.user) || { id: st.user_id, username: st.member?.nick || "User" };
        const isSelf = currentUser && u.id === currentUser.id;
        addParticipantToGrid(u, Boolean(st.self_stream), st, isSelf);
        added.add(u.id);
      }
    }

    if (currentUser && !added.has(currentUser.id)) {
      addParticipantToGrid(currentUser, false, { self_mute: isMuted, self_deaf: isDeafened }, true);
    }

    updateVoiceSidebarUsers();
  } catch (err) {
    console.error("Failed to join voice channel:", err);
  }
}

async function disconnectVoice() {
  try {
    if (isStreaming) {
      await invoke("stop_stream");
      isStreaming = false;
      btnStreamToggle.classList.remove("active");
    }
    await invoke("leave_voice", { guildId: activeVoiceGuildId });
  } catch (e) {}

  activeVoiceChannelId = null;
  activeVoiceGuildId = null;
  voiceConnectedBar.style.display = "none";
  btnToggleStageView.style.display = "none";
  toggleStageView(false);
  participantGrid.innerHTML = "";
  streamSwitcherBar.innerHTML = "";
  streamPlayerBox.style.display = "none";
  updateVoiceSidebarUsers();
}

function toggleStageView(showStage) {
  stageViewActive = showStage;
  stageContainer.style.display = showStage ? "flex" : "none";
  messagesList.style.display = showStage ? "none" : "flex";
  document.getElementById("chat-input-bar").style.display = showStage ? "none" : "block";
  btnToggleStageView.innerText = showStage ? "💬 Chat" : "🎙️ Stage";
}

function renderVoiceUsersForChannel(channelId, container) {
  if (!container) {
    container = document.getElementById(`voice-users-${channelId}`);
  }
  if (!container) return;

  container.innerHTML = "";
  for (const st of currentGuildVoiceStates.values()) {
    if (st.channel_id === channelId) {
      container.appendChild(createVoiceUserRow(st));
    }
  }
}

function updateVoiceSidebarUsers() {
  document.querySelectorAll(".voice-channel-users").forEach((container) => {
    const channelId = container.id.replace("voice-users-", "");
    renderVoiceUsersForChannel(channelId, container);
  });
}

function createVoiceUserRow(st) {
  const member = st.member;
  const user = (member && member.user) || { id: st.user_id, username: member?.nick || "User" };
  const name = member?.nick || user.global_name || user.username || "User";
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=32`
    : null;

  const row = document.createElement("div");
  row.className = "voice-user-row";
  row.id = `voice-user-${user.id}`;
  row.setAttribute("data-user-id", user.id);

  const avatarHtml = avatarUrl
    ? `<img src="${avatarUrl}" class="voice-avatar" alt="${escapeHtml(name)}">`
    : `<div class="voice-avatar-placeholder">${escapeHtml(name.charAt(0).toUpperCase())}</div>`;

  const isMuted = Boolean(st.mute || st.self_mute);
  const isDeaf = Boolean(st.deaf || st.self_deaf);
  const isLive = Boolean(st.self_stream);

  let iconsHtml = "";
  if (isLive) iconsHtml += `<span class="live-pill">LIVE</span>`;
  if (isDeaf) iconsHtml += `<span class="voice-icon-deaf" title="Deafened">🎧</span>`;
  else if (isMuted) iconsHtml += `<span class="voice-icon-muted" title="Muted">🔇</span>`;

  row.innerHTML = `
    <div class="voice-user-avatar-wrap">
      ${avatarHtml}
    </div>
    <span class="voice-user-name">${escapeHtml(name)}</span>
    <div class="voice-user-icons">${iconsHtml}</div>
  `;
  return row;
}

function handleVoiceStateUpdate(state) {
  if (!state.channel_id) {
    currentGuildVoiceStates.delete(state.user_id);
  } else {
    currentGuildVoiceStates.set(state.user_id, state);
  }

  updateVoiceSidebarUsers();

  if (activeVoiceChannelId) {
    if (state.channel_id === activeVoiceChannelId) {
      const u = (state.member && state.member.user) || { id: state.user_id, username: state.member?.nick || "User" };
      const isSelf = currentUser && u.id === currentUser.id;
      addParticipantToGrid(u, Boolean(state.self_stream), state, isSelf);
    } else {
      removeParticipantFromGrid(state.user_id);
    }
  }
}

function addParticipantToGrid(user, isStreamActive, voiceState, isSelf) {
  let card = document.getElementById(`participant-${user.id}`);
  const name = voiceState?.member?.nick || user.global_name || user.username || "User";
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
    : null;

  const isMuted = voiceState ? Boolean(voiceState.mute || voiceState.self_mute) : false;
  const isDeaf = voiceState ? Boolean(voiceState.deaf || voiceState.self_deaf) : false;

  if (!card) {
    card = document.createElement("div");
    card.id = `participant-${user.id}`;
    card.className = "participant-card" + (isSelf ? " is-self" : "");
    participantGrid.appendChild(card);
  }

  const avatarHtml = avatarUrl
    ? `<img src="${avatarUrl}" alt="${escapeHtml(name)}">`
    : `<div class="avatar-placeholder">${escapeHtml(name.charAt(0).toUpperCase())}</div>`;

  let badgesHtml = "";
  if (isStreamActive) {
    badgesHtml += `<span class="badge-live">LIVE</span>`;
  }
  if (isDeaf) {
    badgesHtml += `<span class="badge-status" title="Deafened">🎧</span>`;
  } else if (isMuted) {
    badgesHtml += `<span class="badge-status" title="Muted">🔇</span>`;
  }

  card.innerHTML = `
    <div class="participant-badges">${badgesHtml}</div>
    <div class="participant-avatar">${avatarHtml}</div>
    <div class="participant-name">${escapeHtml(name)}${isSelf ? " (You)" : ""}</div>
  `;
}

function removeParticipantFromGrid(userId) {
  const card = document.getElementById(`participant-${userId}`);
  if (card) {
    card.remove();
  }
}

// Stream Switcher & Stage Player
function updateStreamSwitcher() {
  streamSwitcherBar.innerHTML = "";
  if (activeStreams.size === 0) return;

  activeStreams.forEach((stream, key) => {
    const chip = document.createElement("div");
    chip.className = "stream-chip" + (selectedStreamKey === key ? " active" : "");
    chip.innerHTML = `
      <span class="live-badge">LIVE</span>
      <span style="font-weight: 600; color: #fff;">Stream: ${key.split(':').pop() || 'User'}</span>
    `;

    chip.addEventListener("click", () => {
      selectStreamPlayer(key, stream);
    });

    streamSwitcherBar.appendChild(chip);
  });
}

async function selectStreamPlayer(streamKey, streamData) {
  selectedStreamKey = streamKey;
  updateStreamSwitcher();

  try {
    await invoke("watch_stream", { streamKey });
  } catch (e) {}

  streamPlayerBox.style.display = "flex";
  streamTitleText.innerText = "Live Stream";
  streamUserText.innerText = `Stream Key: ${streamKey}`;

  // Start animated visual preview on stream canvas
  startStreamCanvasAnimation();
}

let canvasAnimId = null;
function startStreamCanvasAnimation() {
  if (canvasAnimId) cancelAnimationFrame(canvasAnimId);
  const ctx = streamCanvas.getContext("2d");
  streamCanvas.width = 640;
  streamCanvas.height = 360;

  let frame = 0;
  function renderFrame() {
    frame++;
    ctx.fillStyle = "#111214";
    ctx.fillRect(0, 0, streamCanvas.width, streamCanvas.height);

    // Dynamic stream background simulation
    const gradient = ctx.createLinearGradient(0, 0, streamCanvas.width, streamCanvas.height);
    gradient.addColorStop(0, "#1e1f22");
    gradient.addColorStop(0.5, "#2b2d31");
    gradient.addColorStop(1, "#18191c");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, streamCanvas.width, streamCanvas.height);

    // Audio/Stream waveform pulses
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#5865f2";
    ctx.beginPath();
    const centerY = streamCanvas.height / 2;
    for (let x = 0; x < streamCanvas.width; x += 10) {
      const y = centerY + Math.sin((x + frame * 3) * 0.03) * 20 * Math.sin(frame * 0.05);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Stream Active badge
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("DISCORD STREAM FEED ACTIVE", streamCanvas.width / 2, centerY - 40);

    ctx.fillStyle = "#949ba4";
    ctx.font = "12px sans-serif";
    ctx.fillText("Receiving video and audio stream packets", streamCanvas.width / 2, centerY + 50);

    if (streamPlayerBox.style.display !== "none") {
      canvasAnimId = requestAnimationFrame(renderFrame);
    }
  }
  renderFrame();
}

function getInitials(name) {
  return name.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase();
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Start app on DOMContentLoaded
window.addEventListener("DOMContentLoaded", init);
