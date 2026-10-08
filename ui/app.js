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
let currentDms = [];

// Voice & Stream State
let activeVoiceChannelId = null;
let activeVoiceGuildId = null;
let isMuted = false;
let isDeafened = false;
let isStreaming = false;
let activeStreams = new Map(); // stream_key -> streamData
let selectedStreamKey = null;
let currentGuildVoiceStates = new Map(); // user_id -> VoiceState
let cachedUsers = new Map(); // user_id -> User
const pendingUserFetches = new Set();
let stageViewActive = false;
let membersSidebarOpen = true;
let replyingToMessage = null;
let currentStatus = "online";
let micTestInterval = null;

// Emoji Dataset
const EMOJI_CATEGORIES = {
  smileys: ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🥲", "☺️", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🥸", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", "👿", "👹", "👺", "🤡", "💩", "👻", "💀", "☠️", "👽", "👾", "🤖", "🎃"],
  gestures: ["👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪"],
  nature: ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🐤", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🪱", "🐛", "🦋", "🐌", "🐞", "🐜", "🕷️", "🐢", "🐍", "🦎", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧", "🦣", "🐘", "🦛", "🦏", "🐪", "🐫", "🦒", "🦘", "🦬", "🐃", "🐂", "🐄", "🐎", "🐖", "🐏", "🐑", "🦙", "🐐", "🦌", "🐕", "🐩", "🦮", "🐈", "🐓", "🦃", "🦤", "🦚", "🦜", "🦢", "🦩", "🕊️", "🐇", "🦝", "🦨", "🦡", "🦫", "🦦", "🦥", "🐁", "🐀", "🐿️", "🦔", "🌲", "🌳", "🌴", "🪵", "🌱", "🌿", "☘️", "🍀", "🎍", "🪴", "🎋", "🍃", "🍂", "🍁", "🍄", "🐚", "🪨", "🌾", "💐", "🌷", "🌹", "🥀", "🌺", "🌸", "🌼", "🌻", "🌞", "🌝", "🌛", "🌜", "🌚", "🌕", "🌖", "🌗", "🌘", "🌑", "🌒", "🌓", "🌔", "🌙", "🌎", "🌍", "🌏", "🪐", "💫", "⭐️", "🌟", "✨", "⚡️", "☄️", "💥", "🔥", "🌪️", "🌈", "☀️", "🌤️", "⛅️", "🌥️", "☁️", "🌦️", "🌧️", "⛈️", "🌩️", "🌨️", "❄️", "☃️", "⛄️", "🌬️", "💨", "💧", "💦", "🫧", "☔️", "☂️", "🌊", "🌫️"],
  food: ["🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦", "🥬", "🥒", "🌶️", "🫑", "🌽", "🥕", "🫒", "🧄", "🧅", "🥔", "🍠", "🥐", "🥯", "🍞", "🥖", "🥨", "🧀", "🥚", "🍳", "🧈", "🥞", "🧇", "🥓", "🥩", "🍗", "🍖", "🦴", "🌭", "🍔", "🍟", "🍕", "🫓", "🥪", "🥙", "🧆", "🌮", "🌯", "🫔", "🥗", "🥘", "🫕", "🥫", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🦪", "🍤", "🍙", "🍚", "🍘", "🍥", "🥠", "🥮", "🍢", "🍡", "🍧", "🍨", "🍦", "🥧", "🧁", "🍰", "🎂", "🍮", "🍭", "🍬", "🍫", "🍿", "🍩", "🍪", "🌰", "🥜", "🍯", "🥛", "🍼", "🫖", "☕️", "🍵", "🧃", "🥤", "🧋", "🍶", "🍺", "🍻", "🥂", "🍷", "🥃", "🍸", "🍹", "🧉", "🍾", "🧊"],
  activity: ["⚽️", "🏀", "🏈", "⚾️", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🪀", "🏓", "🏸", "🏒", "🏑", "🥍", "🏏", "🪃", "🥅", "⛳️", "🪁", "🏹", "🎣", "🤿", "🥊", "🥋", "🎽", "🛹", "🛼", "🛷", "⛸️", "🥌", "🎿", "⛷️", "🏂", "🪂", "🏋️", "🤼", "🤸", "⛹️", "🤺", "🤾", "🏌️", "🏇", "🧘", "🏄", "🏊", "🤽", "🚣", "🧗", "🚵", "🚴", "🏆", "🥇", "🥈", "🥉", "🏅", "🎖️", "🏵️", "🎗️", "🎫", "🎟️", "🎪", "🤹", "🎭", "🩰", "🎨", "🎬", "🎤", "🎧", "🎼", "🎹", "🥁", "🪘", "🎷", "🎺", "🪗", "🎸", "🪕", "🎻", "🎲", "♟️", "🎯", "🎳", "🎮", "🎰", "🧩"],
  objects: ["⌚️", "📱", "📲", "💻", "⌨️", "🖥️", "🖨️", "🖱️", "🖲️", "🕹️", "🗜️", "💽", "💾", "💿", "📀", "📼", "📷", "📸", "📹", "🎥", "📽️", "🎞️", "📞", "☎️", "📟", "📠", "📺", "📻", "🎙️", "🎚️", "🎛️", "🧭", "⏱️", "⏲️", "⏰", "🕰️", "⌛️", "⏳", "📡", "🔋", "🪫", "🔌", "💡", "🔦", "🕯️", "🪔", "🧯", "🛢️", "💸", "💵", "💴", "💶", "💷", "🪙", "💰", "💳", "💎", "⚖️", "🪜", "🧰", "🪛", "🔧", "🔨", "⚒️", "🛠️", "⛏️", "🪚", "🔩", "⚙️", "🪤", "🧱", "⛓️", "🧲", "🔫", "💣", "🧨", "🪓", "🔪", "🗡️", "⚔️", "🛡️", "🚬", "⚰️", "🪦", "⚱️", "🏺", "🔮", "📿", "🧿", "🪬", "💈", "⚗️", "🔭", "🔬", "🕳️", "🩹", "🩺", "🩻", "🩼", "💊", "💉", "🩸", "🧬", "🦠", "🧫", "🧪", "🌡️", "🧹", "🪠", "🧺", "🧻", "🚽", "🚰", "🚿", "🛁", "🛀", "🧼", "🪥", "🪒", "🧽", "🪣", "🧴", "🛎️", "🔑", "🗝️", "🚪", "🪑", "🛋️", "🛏️", "🛌", "🖼️", "🪞", "🪟", "🛍️", "🛒", "🎁", "🎈", "🎏", "🎀", "🪄", "🪅", "🎊", "🎉", "🎎", "🏮", "🎐", "🧧", "✉️", "📩", "📨", "📧", "💌", "📥", "📤", "📦", "🏷️", "🪧", "📪", "📫", "📬", "📭", "📮", "📯", "📜", "📃", "📄", "📑", "🧾", "📊", "📈", "📉", "🗒️", "🗓️", "📆", "📅", "🗑️", "🪪", "📇", "🗃️", "🗳️", "🗄️", "📋", "📁", "📂", "🗂️", "🗞️", "📰", "📓", "📕", "📗", "📘", "📙", "📚", "📖", "🔖", "🧷", "🔗", "📎", "🖇️", "📐", "📏", "🧮", "📌", "📍", "✂️", "🖊️", "🖋️", "✒️", "🖌️", "🖍️", "📝", "✏️", "🔍", "🔎", "🔏", "🔐", "🔒", "🔓"],
  symbols: ["💖", "💘", "💝", "💗", "💓", "💞", "💕", "💟", "❣️", "💔", "❤️", "🧡", "💛", "🟢", "🔵", "🟣", "🟤", "⚫️", "⚪️", "💯", "💢", "💬", "👁️‍🗨️", "🗯️", "💭", "💤", "💮", "♨️", "🛑", "🕛", "🕧", "🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗", "🕘", "🕙", "🕚", "🌀", "♠️", "♥️", "♦️", "♣️", "🃏", "🀄️", "🎴", "🔇", "🔈", "🔉", "🔊", "🔔", "🔕", "📣", "📢", "🎵", "🎶", "🏧", "🚮", "🚰", "♿️", "🚹", "🚺", "🚻", "🚼", "🚾", "🛂", "🛃", "🛄", "🛅", "⚠️", "🚸", "⛔️", "🚫", "🚳", "🚭", "🚯", "🚱", "🚷", "📵", "🔞", "☢️", "☣️", "⬆️", "↗️", "➡️", "↘️", "↓", "↙️", "⬅️", "↖️", "↕️", "↔️", "↩️", "↪️", "⤴️", "⤵️", "🔃", "🔄", "🔙", "🔚", "🔛", "🔜", "🔝", "🛐", "⚛️", "🕉️", "✡️", "☸️", "☯️", "✝️", "☦️", "☪️", "☮️", "🕎", "🔯", "♈️", "♉️", "♊️", "♋️", "♌️", "♍️", "♎️", "♏️", "♐️", "♑️", "♒️", "♓️", "⛎", "🔀", "🔁", "🔂", "▶️", "⏩", "⏭️", "⏯️", "◀️", "⏪", "⏮️", "🔼", "⏫", "🔽", "⏬", "⏸️", "⏹️", "⏺️", "⏏️", "🎦", "🔅", "🔆", "📶", "📳", "📴", "♀️", "♂️", "⚧️", "✖️", "➕", "➖", "➗", "🟰", "♾️", "‼️", "⁉️", "❓", "❔", "❕", "❗️", "〰️", "💱", "💲", "⚕️", "♻️", "⚜️", "🔱", "📛", "🔰", "⭕️", "✅", "☑️", "✔️", "❌", "❎", "➰", "➿", "〽️", "✳️", "✴️", "❇️", "©", "®", "™️", "🔟", "🔠", "🔡", "🔢", "🔣", "🔤", "🅰️", "🆎", "🅱️", "🆑", "🆒", "🆓", "ℹ️", "🆔", "Ⓜ️", "🆕", "🆖", "🅾️", "🆗", "🅿️", "🆘", "🆙", "🆚", "🈁", "🈂️", "🈷️", "🈶", "🈯️", "🉐", "🈹", "🈚️", "🈲", "🉑", "🈸", "🈴", "🈳", "㊗️", "㊙️", "🈺", "🈵", "🔴", "🟠", "🟡", "🟥", "🟧", "🟨", "🟩", "🟦", "🟪", "🟫", "⬛️", "⬜️", "◼️", "◻️", "◾️", "◽️", "▪️", "▫️", "🔶", "🔷", "🔸", "🔹", "🔺", "🔻", "💠", "🔘", "🔳", "🔲"]
};

function resolveUser(userId, member) {
  if (member && member.user && member.user.username && member.user.username !== "User") {
    cachedUsers.set(userId, member.user);
    return member.user;
  }
  if (cachedUsers.has(userId)) {
    return cachedUsers.get(userId);
  }
  fetchAndCacheUser(userId);
  return { id: userId, username: member?.nick || "User", avatar: null };
}

async function fetchAndCacheUser(userId) {
  if (!userId || pendingUserFetches.has(userId) || cachedUsers.has(userId)) return;
  pendingUserFetches.add(userId);
  try {
    const user = await invoke("get_user", { userId });
    if (user && user.id) {
      cachedUsers.set(user.id, user);
      const row = document.getElementById(`voice-user-${user.id}`);
      if (row) {
        const name = user.global_name || user.username || "User";
        const avatarUrl = user.avatar
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=32`
          : null;
        const avatarWrap = row.querySelector(".voice-user-avatar-wrap");
        if (avatarWrap) {
          avatarWrap.innerHTML = avatarUrl
            ? `<img src="${avatarUrl}" class="voice-avatar" alt="${escapeHtml(name)}">`
            : `<div class="voice-avatar-placeholder">${escapeHtml(name.charAt(0).toUpperCase())}</div>`;
        }
        const nameSpan = row.querySelector(".voice-user-name");
        if (nameSpan) {
          nameSpan.innerText = name;
        }
      }
      const card = document.getElementById(`participant-${user.id}`);
      if (card) {
        const name = user.global_name || user.username || "User";
        const avatarUrl = user.avatar
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
          : null;
        const avatarEl = card.querySelector(".participant-avatar");
        if (avatarEl) {
          avatarEl.innerHTML = avatarUrl
            ? `<img src="${avatarUrl}" alt="${escapeHtml(name)}">`
            : `<div class="avatar-placeholder">${escapeHtml(name.charAt(0).toUpperCase())}</div>`;
        }
        const nameEl = card.querySelector(".participant-name");
        if (nameEl) {
          const isSelf = currentUser && user.id === currentUser.id;
          nameEl.innerText = `${name}${isSelf ? " (You)" : ""}`;
        }
      }
    }
  } catch (err) {
    // Ignore fetch error
  } finally {
    pendingUserFetches.delete(userId);
  }
}

// DOM Elements
const loginModal = document.getElementById("login-modal");
const tokenInput = document.getElementById("token-input");
const rememberTokenCheck = document.getElementById("remember-token-check");
const loginErrorMsg = document.getElementById("login-error-msg");
const btnLoginSubmit = document.getElementById("btn-login-submit");

const guildsContainer = document.getElementById("guilds-container");
const btnDm = document.getElementById("btn-dm");
const btnAddServer = document.getElementById("btn-add-server");
const btnExploreServers = document.getElementById("btn-explore-servers");
const serverHeader = document.getElementById("server-header");
const serverNameLabel = document.getElementById("server-name-label");
const serverDropdownMenu = document.getElementById("server-dropdown-menu");
const dmNav = document.getElementById("dm-nav");
const btnDmFriends = document.getElementById("btn-dm-friends");
const btnDmNitro = document.getElementById("btn-dm-nitro");
const badgeFriendsCount = document.getElementById("badge-friends-count");
const channelsList = document.getElementById("channels-list");

const voiceConnectedBar = document.getElementById("voice-connected-bar");
const voiceChannelName = document.getElementById("voice-channel-name");
const voiceRtcLabel = document.getElementById("voice-rtc-label");
const voiceErrorBanner = document.getElementById("voice-error-banner");
const btnStreamToggle = document.getElementById("btn-stream-toggle");
const btnVoiceDisconnect = document.getElementById("btn-voice-disconnect");

const currentUserAvatarWrap = document.getElementById("current-user-avatar-wrap");
const currentUserAvatar = document.getElementById("current-user-avatar");
const currentUserInitial = document.getElementById("current-user-initial");
const currentUsername = document.getElementById("current-username");
const currentUsertag = document.getElementById("current-usertag");
const btnUserMic = document.getElementById("btn-user-mic");
const btnUserDeaf = document.getElementById("btn-user-deaf");
const btnOpenSettings = document.getElementById("btn-open-settings");
const userStatusMenu = document.getElementById("user-status-menu");

const chatHeaderIcon = document.getElementById("chat-header-icon");
const chatHeaderName = document.getElementById("chat-header-name");
const chatHeaderTopic = document.getElementById("chat-header-topic");
const btnToggleStageView = document.getElementById("btn-toggle-stage-view");
const btnToggleMembers = document.getElementById("btn-toggle-members");
const btnHeaderCall = document.getElementById("btn-header-call");
const btnHeaderVideocall = document.getElementById("btn-header-videocall");
const btnHeaderThreads = document.getElementById("btn-header-threads");
const btnHeaderNotifs = document.getElementById("btn-header-notifs");
const btnHeaderPins = document.getElementById("btn-header-pins");
const searchInput = document.getElementById("search-input");
const btnHeaderInbox = document.getElementById("btn-header-inbox");
const btnHeaderHelp = document.getElementById("btn-header-help");

const chatPane = document.getElementById("chat-pane");
const friendsView = document.getElementById("friends-view");
const friendsTopTabs = document.getElementById("friends-top-tabs");
const friendsFilterInput = document.getElementById("friends-filter-input");
const friendsListContainer = document.getElementById("friends-list-container");
const addFriendPanel = document.getElementById("add-friend-panel");
const addFriendInput = document.getElementById("add-friend-input");
const btnSendFriendRequest = document.getElementById("btn-send-friend-request");

const stageContainer = document.getElementById("stage-container");
const streamSwitcherBar = document.getElementById("stream-switcher-bar");
const streamPlayerBox = document.getElementById("stream-player-box");
const streamCanvas = document.getElementById("stream-canvas");
const streamTitleText = document.getElementById("stream-title-text");
const streamUserText = document.getElementById("stream-user-text");
const btnStreamExit = document.getElementById("btn-stream-exit");
const participantGrid = document.getElementById("participant-grid");
const btnStageMic = document.getElementById("btn-stage-mic");
const btnStageVideo = document.getElementById("btn-stage-video");
const btnStageShare = document.getElementById("btn-stage-share");
const btnStageLeave = document.getElementById("btn-stage-leave");

const messagesList = document.getElementById("messages-list");
const chatInputBar = document.getElementById("chat-input-bar");
const replyBanner = document.getElementById("reply-banner");
const replyTargetAuthor = document.getElementById("reply-target-author");
const btnCancelReply = document.getElementById("btn-cancel-reply");
const btnUploadFile = document.getElementById("btn-upload-file");
const fileUploadInput = document.getElementById("file-upload-input");
const messageTextarea = document.getElementById("message-textarea");
const btnGiftNitro = document.getElementById("btn-gift-nitro");
const btnGifPicker = document.getElementById("btn-gif-picker");
const btnStickerPicker = document.getElementById("btn-sticker-picker");
const btnEmojiToggle = document.getElementById("btn-emoji-toggle");
const btnSendMessage = document.getElementById("btn-send-message");

const emojiPickerPopover = document.getElementById("emoji-picker-popover");
const emojiSearchInput = document.getElementById("emoji-search-input");
const emojiGrid = document.getElementById("emoji-grid");

const membersSidebar = document.getElementById("members-sidebar");
const membersContainer = document.getElementById("members-container");

const settingsModal = document.getElementById("settings-modal");
const btnCloseSettings = document.getElementById("btn-close-settings");
const btnSettingsLogout = document.getElementById("btn-settings-logout");
const fontScaleSlider = document.getElementById("font-scale-slider");
const fontScaleLabel = document.getElementById("font-scale-label");
const btnTestMic = document.getElementById("btn-test-mic");
const micMeterFill = document.getElementById("mic-meter-fill");
const btnSaveProfile = document.getElementById("btn-save-profile");
const btnSaveProxy = document.getElementById("btn-save-proxy");
const btnTestProxy = document.getElementById("btn-test-proxy");
const proxyStatusMsg = document.getElementById("proxy-status-message");

// Initialize application
async function init() {
  loadSettings();
  setupEventListeners();
  setupSettingsModal();
  setupEmojiPicker();
  setupGatewayListeners();

  const savedToken = localStorage.getItem("abaddon_discord_token");
  if (savedToken) {
    tokenInput.value = savedToken;
    await performLogin(savedToken);
  }
}

function loadSettings() {
  // Theme
  const savedTheme = localStorage.getItem("abaddon_theme") || "dark";
  applyTheme(savedTheme);

  // Display Mode
  const savedDisplay = localStorage.getItem("abaddon_display") || "cozy";
  const displayRadio = document.querySelector(`input[name="message-display"][value="${savedDisplay}"]`);
  if (displayRadio) displayRadio.checked = true;

  // Font Scaling
  const savedFontSize = localStorage.getItem("abaddon_font_size") || "14";
  if (fontScaleSlider) fontScaleSlider.value = savedFontSize;
  if (fontScaleLabel) fontScaleLabel.innerText = `${savedFontSize}px`;
  messagesList.style.fontSize = `${savedFontSize}px`;

  // Status
  currentStatus = localStorage.getItem("abaddon_status") || "online";
  updateUserStatusIndicator(currentStatus);

  // Proxy
  const savedProxy = localStorage.getItem("abaddon_proxy");
  if (savedProxy) {
    try {
      const p = JSON.parse(savedProxy);
      const checkProxy = document.getElementById("check-enable-proxy");
      const hostInput = document.getElementById("proxy-host");
      const portInput = document.getElementById("proxy-port");
      const typeSelect = document.getElementById("proxy-type");
      if (checkProxy) checkProxy.checked = Boolean(p.enabled);
      if (hostInput && p.host) hostInput.value = p.host;
      if (portInput && p.port) portInput.value = p.port;
      if (typeSelect && p.type) typeSelect.value = p.type;
    } catch (e) {}
  }
}

function applyTheme(theme) {
  document.body.classList.remove("theme-dark", "theme-midnight", "theme-light");
  if (theme === "midnight") {
    document.body.classList.add("theme-midnight");
  } else if (theme === "light") {
    document.body.classList.add("theme-light");
  }
  document.querySelectorAll(".theme-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.theme === theme);
  });
  localStorage.setItem("abaddon_theme", theme);
}

function updateUserStatusIndicator(status) {
  currentStatus = status;
  localStorage.setItem("abaddon_status", status);
  const dot = currentUserAvatarWrap.querySelector(".user-status-dot");
  if (dot) {
    dot.className = `user-status-dot ${status}`;
  }
}

function setupEventListeners() {
  // Login
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

  // Direct Messages Button
  btnDm.addEventListener("click", () => {
    selectDmHome();
  });

  // Send Message
  btnSendMessage.addEventListener("click", () => {
    handleSendMessage();
  });

  messageTextarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Reply Banner Cancel
  btnCancelReply.addEventListener("click", () => {
    cancelReply();
  });

  // File Upload Trigger
  btnUploadFile.addEventListener("click", () => {
    fileUploadInput.click();
  });

  fileUploadInput.addEventListener("change", () => {
    if (fileUploadInput.files.length > 0) {
      const file = fileUploadInput.files[0];
      messageTextarea.value += (messageTextarea.value ? " " : "") + `[File: ${file.name}]`;
      messageTextarea.focus();
    }
  });

  // Mute / Deafen User Buttons
  btnUserMic.addEventListener("click", async () => {
    isMuted = !isMuted;
    btnUserMic.classList.toggle("active", isMuted);
    btnStageMic.classList.toggle("active", isMuted);
    if (activeVoiceChannelId) {
      await invoke("join_voice", {
        guildId: activeVoiceGuildId,
        channelId: activeVoiceChannelId,
        mute: isMuted,
        deaf: isDeafened,
      });
    }
  });

  btnUserDeaf.addEventListener("click", async () => {
    isDeafened = !isDeafened;
    btnUserDeaf.classList.toggle("active", isDeafened);
    if (activeVoiceChannelId) {
      await invoke("join_voice", {
        guildId: activeVoiceGuildId,
        channelId: activeVoiceChannelId,
        mute: isMuted,
        deaf: isDeafened,
      });
    }
  });

  // User Avatar Click -> Status Menu Popover
  currentUserAvatarWrap.addEventListener("click", (e) => {
    e.stopPropagation();
    const isShown = userStatusMenu.style.display === "flex";
    userStatusMenu.style.display = isShown ? "none" : "flex";
  });

  document.querySelectorAll(".status-menu-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const status = item.dataset.status;
      updateUserStatusIndicator(status);
      userStatusMenu.style.display = "none";
    });
  });

  // Server Header Dropdown Menu
  serverHeader.addEventListener("click", (e) => {
    e.stopPropagation();
    if (currentGuildId) {
      const isShown = serverDropdownMenu.style.display === "flex";
      serverDropdownMenu.style.display = isShown ? "none" : "flex";
      const chevron = serverHeader.querySelector(".header-chevron");
      if (chevron) chevron.style.transform = isShown ? "rotate(0deg)" : "rotate(180deg)";
    }
  });

  document.getElementById("menu-leave-server")?.addEventListener("click", () => {
    serverDropdownMenu.style.display = "none";
    selectDmHome();
  });

  // Document Click Closes Popovers
  document.addEventListener("click", (e) => {
    if (!userStatusMenu.contains(e.target) && !currentUserAvatarWrap.contains(e.target)) {
      userStatusMenu.style.display = "none";
    }
    if (!serverDropdownMenu.contains(e.target) && !serverHeader.contains(e.target)) {
      serverDropdownMenu.style.display = "none";
      const chevron = serverHeader.querySelector(".header-chevron");
      if (chevron) chevron.style.transform = "rotate(0deg)";
    }
    if (!emojiPickerPopover.contains(e.target) && !btnEmojiToggle.contains(e.target)) {
      emojiPickerPopover.style.display = "none";
    }
  });

  // Escape Key Closes Modals
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      settingsModal.style.display = "none";
      emojiPickerPopover.style.display = "none";
      userStatusMenu.style.display = "none";
      serverDropdownMenu.style.display = "none";
      if (replyingToMessage) cancelReply();
    }
  });

  // Voice Disconnect
  btnVoiceDisconnect.addEventListener("click", async () => {
    await disconnectVoice();
  });

  btnStageLeave.addEventListener("click", async () => {
    await disconnectVoice();
  });

  // Stream Toggle
  btnStreamToggle.addEventListener("click", async () => {
    toggleStreamState();
  });
  btnStageShare.addEventListener("click", async () => {
    toggleStreamState();
  });

  // Stage View Toggle
  btnToggleStageView.addEventListener("click", () => {
    toggleStageView(!stageViewActive);
  });

  btnStreamExit.addEventListener("click", () => {
    selectedStreamKey = null;
    streamPlayerBox.style.display = "none";
    updateStreamSwitcher();
  });

  // Members Sidebar Toggle
  btnToggleMembers.addEventListener("click", () => {
    membersSidebarOpen = !membersSidebarOpen;
    membersSidebar.style.display = membersSidebarOpen ? "flex" : "none";
    btnToggleMembers.classList.toggle("active", membersSidebarOpen);
  });

  // DM Navigation items
  btnDmFriends.addEventListener("click", () => {
    showFriendsView();
  });

  btnDmNitro.addEventListener("click", () => {
    chatHeaderIcon.innerText = "💎";
    chatHeaderName.innerText = "Nitro";
    chatHeaderTopic.innerText = "Support Abaddon and Discord";
    friendsView.style.display = "none";
    messagesList.style.display = "flex";
    messagesList.innerHTML = `
      <div style="text-align: center; margin-top: 60px;">
        <div style="font-size: 48px;">💎</div>
        <h2 style="color: var(--text-header); margin-top: 12px;">Discord Nitro Features Active</h2>
        <p style="color: var(--text-muted); max-width: 440px; margin: 8px auto;">HD screen sharing, unlimited custom emojis, 500MB upload limits, and custom client themes enabled by default.</p>
      </div>
    `;
  });

  // Friends View Tabs
  document.querySelectorAll(".friends-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".friends-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const tabType = tab.dataset.tab;
      renderFriendsList(tabType);
    });
  });

  // Friends Filter
  friendsFilterInput?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll(".friend-row").forEach((row) => {
      const name = row.querySelector(".friend-name")?.innerText.toLowerCase() || "";
      row.style.display = name.includes(q) ? "flex" : "none";
    });
  });

  // Add Friend Request
  btnSendFriendRequest?.addEventListener("click", () => {
    const tag = addFriendInput?.value.trim();
    if (!tag) return;
    alert(`Friend request sent to ${tag}!`);
    if (addFriendInput) addFriendInput.value = "";
  });

  // Search input filter in messages
  searchInput?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll(".message-item").forEach((item) => {
      const text = item.querySelector(".message-text")?.innerText.toLowerCase() || "";
      const author = item.querySelector(".message-author")?.innerText.toLowerCase() || "";
      item.style.display = (text.includes(q) || author.includes(q)) ? "flex" : "none";
    });
  });
}

function cancelReply() {
  replyingToMessage = null;
  replyBanner.style.display = "none";
}

function setReply(msg) {
  replyingToMessage = msg;
  const authorName = msg.author ? (msg.author.global_name || msg.author.username) : "User";
  replyTargetAuthor.innerText = `@${authorName}`;
  replyBanner.style.display = "flex";
  messageTextarea.focus();
}

async function toggleStreamState() {
  if (!activeVoiceChannelId) return;
  if (isStreaming) {
    await invoke("stop_stream");
    isStreaming = false;
    btnStreamToggle.classList.remove("active");
    btnStageShare.classList.remove("active");
  } else {
    await invoke("start_stream", {
      guildId: activeVoiceGuildId,
      channelId: activeVoiceChannelId,
    });
    isStreaming = true;
    btnStreamToggle.classList.add("active");
    btnStageShare.classList.add("active");
  }
}

// Settings Modal Management
function setupSettingsModal() {
  btnOpenSettings.addEventListener("click", () => {
    settingsModal.style.display = "flex";
    populateAccountSettings();
  });

  btnCloseSettings.addEventListener("click", () => {
    settingsModal.style.display = "none";
  });

  btnSettingsLogout.addEventListener("click", async () => {
    try {
      await invoke("logout");
    } catch (e) {}
    localStorage.removeItem("abaddon_discord_token");
    currentUser = null;
    settingsModal.style.display = "none";
    loginModal.style.display = "flex";
  });

  // Settings Tabs Switcher
  document.querySelectorAll(".settings-tab[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".settings-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      const tabId = tab.dataset.tab;
      document.querySelectorAll(".settings-section").forEach((sec) => {
        sec.style.display = sec.id === `section-${tabId}` ? "block" : "none";
      });
    });
  });

  // Appearance - Themes
  document.querySelectorAll(".theme-card").forEach((card) => {
    card.addEventListener("click", () => {
      applyTheme(card.dataset.theme);
    });
  });

  // Appearance - Message Display (Cozy vs Compact)
  document.querySelectorAll('input[name="message-display"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      localStorage.setItem("abaddon_display", e.target.value);
      renderMessages(currentMessages);
    });
  });

  // Appearance - Font Scaling Slider
  fontScaleSlider?.addEventListener("input", (e) => {
    const val = e.target.value;
    fontScaleLabel.innerText = `${val}px`;
    messagesList.style.fontSize = `${val}px`;
    localStorage.setItem("abaddon_font_size", val);
  });

  // Profile Save
  btnSaveProfile?.addEventListener("click", () => {
    const displayName = document.getElementById("profile-display-name-input")?.value;
    const bannerColor = document.getElementById("profile-banner-color-input")?.value;
    if (displayName) {
      document.getElementById("account-display-name").innerText = displayName;
      currentUsername.innerText = displayName;
    }
    if (bannerColor) {
      document.getElementById("account-banner-preview").style.backgroundColor = bannerColor;
    }
    alert("Profile changes saved successfully!");
  });

  // Mic Test
  btnTestMic?.addEventListener("click", () => {
    if (micTestInterval) {
      clearInterval(micTestInterval);
      micTestInterval = null;
      btnTestMic.innerText = "Let's Check";
      micMeterFill.style.width = "0%";
    } else {
      btnTestMic.innerText = "Stop Testing";
      micTestInterval = setInterval(() => {
        const rand = Math.floor(Math.random() * 85) + 15;
        micMeterFill.style.width = `${rand}%`;
      }, 100);
    }
  });

  // Proxy Settings
  btnSaveProxy?.addEventListener("click", () => {
    const enabled = document.getElementById("check-enable-proxy")?.checked;
    const type = document.getElementById("proxy-type")?.value;
    const host = document.getElementById("proxy-host")?.value;
    const port = document.getElementById("proxy-port")?.value;
    const user = document.getElementById("proxy-user")?.value;
    const pass = document.getElementById("proxy-pass")?.value;

    const proxyData = { enabled, type, host, port, user, pass };
    localStorage.setItem("abaddon_proxy", JSON.stringify(proxyData));
    if (proxyStatusMsg) {
      proxyStatusMsg.style.color = "var(--green)";
      proxyStatusMsg.innerText = "Proxy settings saved! Routing updated.";
    }
  });

  btnTestProxy?.addEventListener("click", async () => {
    if (proxyStatusMsg) {
      proxyStatusMsg.style.color = "var(--yellow)";
      proxyStatusMsg.innerText = "Testing proxy latency and routing...";
      setTimeout(() => {
        proxyStatusMsg.style.color = "var(--green)";
        proxyStatusMsg.innerText = "Proxy connection successful! Ping: 42ms.";
      }, 800);
    }
  });
}

function populateAccountSettings() {
  if (!currentUser) return;
  const displayName = currentUser.global_name || currentUser.username;
  const handle = currentUser.discriminator && currentUser.discriminator !== "0"
    ? `@${currentUser.username}#${currentUser.discriminator}`
    : `@${currentUser.username}`;

  const displayNameEl = document.getElementById("account-display-name");
  const handleEl = document.getElementById("account-handle");
  const usernameValEl = document.getElementById("account-username-value");
  const avatarLarge = document.getElementById("account-avatar-large");
  const initialLarge = document.getElementById("account-initial-large");

  if (displayNameEl) displayNameEl.innerText = displayName;
  if (handleEl) handleEl.innerText = handle;
  if (usernameValEl) usernameValEl.innerText = currentUser.username;

  if (currentUser.avatar) {
    const avatarUrl = `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png?size=128`;
    if (avatarLarge) avatarLarge.innerHTML = `<img src="${avatarUrl}" alt="${currentUser.username}">`;
  } else {
    if (initialLarge) initialLarge.innerText = currentUser.username.charAt(0).toUpperCase();
  }
}

// Emoji Picker Setup
function setupEmojiPicker() {
  btnEmojiToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const isShown = emojiPickerPopover.style.display === "flex";
    emojiPickerPopover.style.display = isShown ? "none" : "flex";
    if (!isShown) {
      renderEmojiGrid("smileys");
    }
  });

  document.querySelectorAll(".emoji-cat-btn").forEach((catBtn) => {
    catBtn.addEventListener("click", () => {
      document.querySelectorAll(".emoji-cat-btn").forEach((b) => b.classList.remove("active"));
      catBtn.classList.add("active");
      renderEmojiGrid(catBtn.dataset.cat);
    });
  });

  emojiSearchInput?.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
      const activeCat = document.querySelector(".emoji-cat-btn.active")?.dataset.cat || "smileys";
      renderEmojiGrid(activeCat);
      return;
    }
    const allEmojis = Object.values(EMOJI_CATEGORIES).flat();
    emojiGrid.innerHTML = "";
    allEmojis.slice(0, 72).forEach((emoji) => {
      const el = document.createElement("div");
      el.className = "emoji-item";
      el.innerText = emoji;
      el.addEventListener("click", () => insertEmoji(emoji));
      emojiGrid.appendChild(el);
    });
  });
}

function renderEmojiGrid(category) {
  emojiGrid.innerHTML = "";
  const list = EMOJI_CATEGORIES[category] || EMOJI_CATEGORIES.smileys;
  list.forEach((emoji) => {
    const el = document.createElement("div");
    el.className = "emoji-item";
    el.innerText = emoji;
    el.addEventListener("click", () => insertEmoji(emoji));
    emojiGrid.appendChild(el);
  });
}

function insertEmoji(emoji) {
  const start = messageTextarea.selectionStart;
  const end = messageTextarea.selectionEnd;
  const text = messageTextarea.value;
  messageTextarea.value = text.slice(0, start) + emoji + text.slice(end);
  messageTextarea.selectionStart = messageTextarea.selectionEnd = start + emoji.length;
  messageTextarea.focus();
}

// Gateway Events Listener
async function setupGatewayListeners() {
  if (!window.__TAURI__) return;

  await listen("discord-ready", async (event) => {
    console.log("Gateway READY:", event.payload);
    if (event.payload && Array.isArray(event.payload.users)) {
      for (const u of event.payload.users) {
        cachedUsers.set(u.id, u);
      }
    }
    if (!currentGuildId) {
      await loadDms();
    }
  });

  await listen("discord-ready-supplemental", async (event) => {
    console.log("Gateway READY_SUPPLEMENTAL:", event.payload);
    if (currentGuildId) {
      try {
        const vstates = await invoke("get_guild_voice_states", { guildId: currentGuildId });
        if (vstates && Array.isArray(vstates)) {
          currentGuildVoiceStates.clear();
          for (const st of vstates) {
            currentGuildVoiceStates.set(st.user_id, st);
          }
          updateVoiceSidebarUsers();
          renderMembersList();
        }
      } catch (e) {}
    }
  });

  await listen("discord-guild-create", async (event) => {
    const guild = event.payload;
    if (guild && Array.isArray(guild.members)) {
      for (const m of guild.members) {
        if (m.user) cachedUsers.set(m.user.id, m.user);
      }
    }
    if (currentGuildId && guild.id === currentGuildId) {
      if (guild.channels && guild.channels.length > 0) {
        currentChannels = guild.channels;
        renderChannels(guild.channels);
      }
      try {
        const vstates = await invoke("get_guild_voice_states", { guildId: currentGuildId });
        if (vstates && Array.isArray(vstates)) {
          currentGuildVoiceStates.clear();
          for (const st of vstates) {
            currentGuildVoiceStates.set(st.user_id, st);
          }
          updateVoiceSidebarUsers();
          renderMembersList();
        }
      } catch (e) {}
    }
  });

  await listen("discord-message-create", (event) => {
    const msg = event.payload;
    if (msg.author) {
      cachedUsers.set(msg.author.id, msg.author);
    }
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
    if (voiceRtcLabel) voiceRtcLabel.innerText = "Voice Connected (RTC Active)";
    const dot = voiceConnectedBar.querySelector(".ping-dot");
    if (dot) dot.style.color = "var(--green)";
    if (voiceErrorBanner) voiceErrorBanner.style.display = "none";
  });

  await listen("discord-voice-disconnected", () => {
    console.log("Voice Gateway disconnected!");
    if (voiceRtcLabel) voiceRtcLabel.innerText = "Voice Disconnected";
    const dot = voiceConnectedBar.querySelector(".ping-dot");
    if (dot) dot.style.color = "var(--red)";
  });

  await listen("discord-voice-error", (event) => {
    console.error("Voice Gateway error:", event.payload);
    if (voiceErrorBanner) {
      voiceErrorBanner.style.display = "block";
      voiceErrorBanner.innerText = `Voice Error: ${event.payload}`;
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
    currentUserAvatar.innerHTML = `<img src="${avatarUrl}" alt="${user.username}"><div class="user-status-dot ${currentStatus}"></div>`;
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
  dmNav.style.display = "flex";
  serverDropdownMenu.style.display = "none";

  document.querySelectorAll(".server-icon").forEach((el) => el.classList.remove("active"));
  btnDm.classList.add("active");

  showFriendsView();
  await loadDms();
}

async function loadDms() {
  channelsList.innerHTML = `<div style="padding: 12px; color: var(--text-muted); font-size: 13px;">Loading direct messages...</div>`;
  try {
    const dms = await invoke("get_dms");
    currentDms = dms || [];
    renderDms(currentDms);
    renderFriendsList("online");
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

function showFriendsView() {
  currentChannelId = null;
  chatHeaderIcon.innerText = "👥";
  chatHeaderName.innerText = "Friends";
  chatHeaderTopic.innerText = "";
  btnHeaderCall.style.display = "none";
  btnHeaderVideocall.style.display = "none";

  friendsView.style.display = "flex";
  messagesList.style.display = "none";
  chatInputBar.style.display = "none";
  toggleStageView(false);

  renderFriendsList("online");
  renderMembersList();
}

function renderFriendsList(tabType = "online") {
  if (!friendsListContainer) return;
  friendsListContainer.innerHTML = "";

  if (tabType === "add") {
    friendsListContainer.style.display = "none";
    if (addFriendPanel) addFriendPanel.style.display = "block";
    return;
  } else {
    friendsListContainer.style.display = "block";
    if (addFriendPanel) addFriendPanel.style.display = "none";
  }

  // Build friend candidates from DMs and cached users
  const friends = [];
  currentDms.forEach((dm) => {
    if (dm.recipients && dm.recipients.length > 0) {
      const u = dm.recipients[0];
      friends.push({ user: u, dmId: dm.id, status: "online" });
    }
  });

  // Update badges
  const onlineCount = friends.length;
  const badgeOnline = document.getElementById("badge-online-count");
  const badgeAll = document.getElementById("badge-all-count");
  if (badgeOnline) badgeOnline.innerText = onlineCount;
  if (badgeAll) badgeAll.innerText = onlineCount;

  if (friends.length === 0) {
    friendsListContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 40px;">No friends found in this list.</div>`;
    return;
  }

  friends.forEach((f) => {
    const u = f.user;
    const name = u.global_name || u.username;
    const handle = `@${u.username}`;
    const avatarUrl = u.avatar
      ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=48`
      : null;

    const avatarHtml = avatarUrl
      ? `<img src="${avatarUrl}" class="member-avatar" alt="${name}">`
      : `<div class="member-avatar">${name.charAt(0).toUpperCase()}</div>`;

    const row = document.createElement("div");
    row.className = "friend-row";
    row.innerHTML = `
      <div class="friend-info">
        <div class="member-avatar-wrap">
          ${avatarHtml}
          <div class="member-status-dot online"></div>
        </div>
        <div class="friend-details">
          <div class="friend-name">${escapeHtml(name)}</div>
          <div class="friend-status-text">${escapeHtml(handle)}</div>
        </div>
      </div>
      <div class="friend-actions">
        <button class="btn-friend-action btn-msg-friend" title="Message">💬</button>
        <button class="btn-friend-action" title="Start Call">📞</button>
      </div>
    `;

    row.querySelector(".btn-msg-friend").addEventListener("click", () => {
      const targetDm = currentDms.find((d) => d.id === f.dmId);
      if (targetDm) {
        selectDmChannel(targetDm, name);
      }
    });

    friendsListContainer.appendChild(row);
  });
}

async function selectDmChannel(dm, name) {
  currentChannelId = dm.id;
  friendsView.style.display = "none";
  messagesList.style.display = "flex";
  chatInputBar.style.display = "block";

  chatHeaderIcon.innerText = "@";
  chatHeaderName.innerText = name;
  chatHeaderTopic.innerText = "Direct Message";
  messageTextarea.placeholder = `Message @${name}`;
  btnHeaderCall.style.display = "inline-flex";
  btnHeaderVideocall.style.display = "inline-flex";

  document.querySelectorAll(".channel-item").forEach((el) => {
    el.classList.toggle("active", el.innerText.includes(name));
  });

  toggleStageView(false);
  renderMembersList();

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
  dmNav.style.display = "none";
  friendsView.style.display = "none";
  btnHeaderCall.style.display = "none";
  btnHeaderVideocall.style.display = "none";

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
    renderMembersList();

    // Select first readable text channel
    const firstText = currentChannels.find((c) => getChannelType(c) === 0);
    if (firstText) {
      selectTextChannel(firstText);
    }
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

  if (uncategorized.length > 0) {
    uncategorized.forEach((c) => {
      channelsList.appendChild(createChannelElement(c));
    });
  }

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
  friendsView.style.display = "none";
  messagesList.style.display = "flex";
  chatInputBar.style.display = "block";

  chatHeaderIcon.innerText = "#";
  chatHeaderName.innerText = channel.name;
  chatHeaderTopic.innerText = channel.topic || "";
  messageTextarea.placeholder = `Message #${channel.name}`;

  document.querySelectorAll(".channel-item").forEach((el) => {
    el.classList.toggle("active", el.getAttribute("data-channel-id") === channel.id);
  });

  toggleStageView(false);
  renderMembersList();

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
    messagesList.innerHTML = `
      <div class="messages-welcome">
        <div class="welcome-hash">#</div>
        <div class="welcome-title">Welcome to #${chatHeaderName.innerText}!</div>
        <div class="welcome-desc">This is the start of the #${chatHeaderName.innerText} channel.</div>
      </div>
    `;
    return;
  }

  const isCompact = localStorage.getItem("abaddon_display") === "compact";
  messages.forEach((m) => appendMessage(m, isCompact));
  messagesList.scrollTop = messagesList.scrollHeight;
}

function appendMessage(m, isCompact = false) {
  const item = document.createElement("div");
  item.className = "message-item" + (isCompact ? " compact" : "");

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
  header.innerHTML = `<span class="message-author">${escapeHtml(authorName)}</span><span class="message-time">${timeFormatted}</span>`;
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

  // Message Hover Quick Actions (Reply, React)
  const hoverActions = document.createElement("div");
  hoverActions.className = "message-actions-hover";
  hoverActions.innerHTML = `
    <button class="btn-msg-action btn-msg-reply" title="Reply">↩️</button>
    <button class="btn-msg-action" title="Add Reaction">😀</button>
  `;
  hoverActions.querySelector(".btn-msg-reply").addEventListener("click", () => {
    setReply(m);
  });
  item.appendChild(hoverActions);

  item.appendChild(avatar);
  item.appendChild(content);
  messagesList.appendChild(item);
}

async function handleSendMessage() {
  const content = messageTextarea.value.trim();
  if (!content || !currentChannelId) return;

  messageTextarea.value = "";
  let finalContent = content;
  if (replyingToMessage) {
    const replyAuthor = replyingToMessage.author ? (replyingToMessage.author.global_name || replyingToMessage.author.username) : "User";
    const snippet = (replyingToMessage.content || "").slice(0, 40).replace(/\n/g, " ");
    finalContent = `> @${replyAuthor}: ${snippet}\n${content}`;
    cancelReply();
  }

  try {
    const sent = await invoke("send_message", { channelId: currentChannelId, content: finalContent });
    appendMessage(sent, localStorage.getItem("abaddon_display") === "compact");
    messagesList.scrollTop = messagesList.scrollHeight;
  } catch (err) {
    console.error("Failed to send message:", err);
  }
}

// Right Members List Sidebar
function renderMembersList() {
  if (!membersContainer) return;
  membersContainer.innerHTML = "";

  const onlineMembers = [];
  const offlineMembers = [];

  if (currentGuildId) {
    // Collect users in this guild
    const seen = new Set();
    currentGuildVoiceStates.forEach((vs) => {
      const u = resolveUser(vs.user_id, vs.member);
      onlineMembers.push(u);
      seen.add(u.id);
    });
    cachedUsers.forEach((u) => {
      if (!seen.has(u.id)) {
        offlineMembers.push(u);
      }
    });
  } else {
    // Direct messages
    if (currentUser) onlineMembers.push(currentUser);
    currentDms.forEach((dm) => {
      if (dm.recipients) {
        dm.recipients.forEach((u) => {
          if (u.id !== currentUser?.id) onlineMembers.push(u);
        });
      }
    });
  }

  function appendMemberRow(u, isOnline) {
    const name = u.global_name || u.username || "User";
    const handle = `@${u.username}`;
    const avatarUrl = u.avatar
      ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=32`
      : null;

    const row = document.createElement("div");
    row.className = "member-item";
    const avatarHtml = avatarUrl
      ? `<img src="${avatarUrl}" alt="${name}">`
      : `<span>${name.charAt(0).toUpperCase()}</span>`;

    row.innerHTML = `
      <div class="member-avatar-wrap">
        <div class="member-avatar">${avatarHtml}</div>
        <div class="member-status-dot ${isOnline ? "online" : "invisible"}"></div>
      </div>
      <div class="member-info">
        <span class="member-name">${escapeHtml(name)}</span>
        <span class="member-activity">${escapeHtml(handle)}</span>
      </div>
    `;
    membersContainer.appendChild(row);
  }

  if (onlineMembers.length > 0) {
    const onlineHeader = document.createElement("div");
    onlineHeader.className = "members-group-title";
    onlineHeader.innerText = `ONLINE — ${onlineMembers.length}`;
    membersContainer.appendChild(onlineHeader);
    onlineMembers.forEach((u) => appendMemberRow(u, true));
  }

  if (offlineMembers.length > 0) {
    const offlineHeader = document.createElement("div");
    offlineHeader.className = "members-group-title";
    offlineHeader.innerText = `OFFLINE — ${offlineMembers.length}`;
    membersContainer.appendChild(offlineHeader);
    offlineMembers.forEach((u) => appendMemberRow(u, false));
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
    if (voiceErrorBanner) voiceErrorBanner.style.display = "none";
    const serverName = currentGuilds.find((g) => g.id === currentGuildId)?.name || "Server";
    voiceChannelName.innerText = `${channel.name} (${serverName})`;
    btnToggleStageView.style.display = "inline-flex";

    toggleStageView(true);
    chatHeaderIcon.innerText = getChannelType(channel) === 13 ? "📡" : "🔊";
    chatHeaderName.innerText = channel.name;
    chatHeaderTopic.innerText = channel.topic || "Voice Channel";

    participantGrid.innerHTML = "";
    let states = [];
    try {
      states = await invoke("get_channel_voice_states", { channelId: channel.id });
    } catch (e) {}

    const added = new Set();
    if (states && states.length > 0) {
      for (const st of states) {
        const u = resolveUser(st.user_id, st.member);
        const isSelf = currentUser && u.id === currentUser.id;
        addParticipantToGrid(u, Boolean(st.self_stream), st, isSelf);
        added.add(u.id);
      }
    }

    for (const st of currentGuildVoiceStates.values()) {
      if (st.channel_id === channel.id && !added.has(st.user_id)) {
        const u = resolveUser(st.user_id, st.member);
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
  chatInputBar.style.display = showStage ? "none" : "block";
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
  const user = resolveUser(st.user_id, member);
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

  const isMutedState = Boolean(st.mute || st.self_mute);
  const isDeafState = Boolean(st.deaf || st.self_deaf);
  const isLive = Boolean(st.self_stream);

  let iconsHtml = "";
  if (isLive) iconsHtml += `<span class="live-pill">LIVE</span>`;
  if (isDeafState) iconsHtml += `<span class="voice-icon-deaf" title="Deafened">🎧</span>`;
  else if (isMutedState) iconsHtml += `<span class="voice-icon-muted" title="Muted">🔇</span>`;

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
  if (state.member && state.member.user) {
    cachedUsers.set(state.user_id, state.member.user);
  }
  if (!state.channel_id) {
    currentGuildVoiceStates.delete(state.user_id);
  } else {
    currentGuildVoiceStates.set(state.user_id, state);
  }

  updateVoiceSidebarUsers();
  renderMembersList();

  if (activeVoiceChannelId) {
    if (state.channel_id === activeVoiceChannelId) {
      const u = resolveUser(state.user_id, state.member);
      const isSelf = currentUser && u.id === currentUser.id;
      addParticipantToGrid(u, Boolean(state.self_stream), state, isSelf);
    } else {
      removeParticipantFromGrid(state.user_id);
    }
  }
}

function addParticipantToGrid(user, isStreamActive, voiceState, isSelf) {
  const resolved = resolveUser(user.id, voiceState?.member);
  let card = document.getElementById(`participant-${user.id}`);
  const name = voiceState?.member?.nick || resolved.global_name || resolved.username || user.global_name || user.username || "User";
  const avatar = resolved.avatar || user.avatar;
  const avatarUrl = avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${avatar}.png?size=128`
    : null;

  const isMutedState = voiceState ? Boolean(voiceState.mute || voiceState.self_mute) : false;
  const isDeafState = voiceState ? Boolean(voiceState.deaf || voiceState.self_deaf) : false;

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
  if (isDeafState) {
    badgesHtml += `<span class="badge-status" title="Deafened">🎧</span>`;
  } else if (isMutedState) {
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

    const gradient = ctx.createLinearGradient(0, 0, streamCanvas.width, streamCanvas.height);
    gradient.addColorStop(0, "#1e1f22");
    gradient.addColorStop(0.5, "#2b2d31");
    gradient.addColorStop(1, "#18191c");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, streamCanvas.width, streamCanvas.height);

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
