#include "util.hpp"
#ifdef WITH_VOICE

// clang-format off

#include "voicewindow.hpp"

#include "abaddon.hpp"
#include "audio/manager.hpp"
#include "components/lazyimage.hpp"
#include "misc/cairo.hpp"
#include "voicewindowaudiencelistentry.hpp"
#include "voicewindowspeakerlistentry.hpp"
#include "windows/voicesettingswindow.hpp"
#include <cmath>

// clang-format on

class VoiceParticipantCard : public Gtk::FlowBoxChild {
public:
    VoiceParticipantCard(Snowflake id, VoiceWindow &parent)
        : m_id(id)
        , m_window(parent)
        , m_card_box(Gtk::ORIENTATION_VERTICAL, 6)
        , m_avatar(64, 64)
        , m_badges_box(Gtk::ORIENTATION_HORIZONTAL, 6)
        , m_live_badge("🔴 LIVE")
        , m_watch_btn("Watch") {
        m_card_box.set_size_request(160, 140);
        m_card_box.get_style_context()->add_class("participant-card");

        m_avatar.set_halign(Gtk::ALIGN_CENTER);
        m_avatar.set_valign(Gtk::ALIGN_CENTER);

        m_name.set_halign(Gtk::ALIGN_CENTER);
        m_name.set_ellipsize(Pango::ELLIPSIZE_END);
        m_name.set_max_width_chars(15);

        m_live_badge.get_style_context()->add_class("badge-live");
        m_live_badge.set_no_show_all(true);

        m_watch_btn.get_style_context()->add_class("stream-watch-btn");
        m_watch_btn.set_no_show_all(true);
        m_watch_btn.signal_clicked().connect([this]() {
            m_window.SelectStream(m_id);
        });

        m_mute_badge.set_text("🔇");
        m_mute_badge.set_tooltip_text("Muted");
        m_mute_badge.set_no_show_all(true);
        m_mute_badge.hide();

        m_deaf_badge.set_text("🎧");
        m_deaf_badge.set_tooltip_text("Deafened");
        m_deaf_badge.set_no_show_all(true);
        m_deaf_badge.hide();

        m_badges_box.set_halign(Gtk::ALIGN_CENTER);
        m_badges_box.pack_start(m_mute_badge, false, false);
        m_badges_box.pack_start(m_deaf_badge, false, false);
        m_badges_box.pack_start(m_live_badge, false, false);
        m_badges_box.pack_start(m_watch_btn, false, false);

        m_card_box.pack_start(m_avatar, false, false, 4);
        m_card_box.pack_start(m_name, false, false, 2);
        m_card_box.pack_start(m_badges_box, false, false, 2);

        add(m_card_box);

        auto &discord = Abaddon::Get().GetDiscordClient();
        if (const auto user = discord.GetUser(m_id); user.has_value()) {
            m_name.set_markup("<b>" + Glib::Markup::escape_text(user->GetUsername()) + "</b>");
            m_avatar.SetURL(user->GetAvatarURL("png", "64"));
        } else {
            m_name.set_text("User");
        }

        if (const auto state = discord.GetVoiceState(m_id); state.has_value()) {
            SetStreaming(util::FlagSet(state->second.Flags, VoiceStateFlags::SelfStream));
            SetMuted(util::FlagSet(state->second.Flags, VoiceStateFlags::Mute | VoiceStateFlags::SelfMute));
            SetDeafened(util::FlagSet(state->second.Flags, VoiceStateFlags::Deaf | VoiceStateFlags::SelfDeaf));
        }
    }

    void SetSpeaking(bool speaking) {
        if (speaking) {
            m_card_box.get_style_context()->add_class("speaking");
        } else {
            m_card_box.get_style_context()->remove_class("speaking");
        }
    }

    void SetStreaming(bool streaming) {
        if (streaming) {
            m_card_box.get_style_context()->add_class("streaming");
            m_live_badge.show();
            m_watch_btn.show();
        } else {
            m_card_box.get_style_context()->remove_class("streaming");
            m_live_badge.hide();
            m_watch_btn.hide();
        }
    }

    void SetMuted(bool muted) {
        if (muted) {
            m_mute_badge.show();
        } else {
            m_mute_badge.hide();
        }
    }

    void SetDeafened(bool deafened) {
        if (deafened) {
            m_deaf_badge.show();
        } else {
            m_deaf_badge.hide();
        }
    }

private:
    Snowflake m_id;
    VoiceWindow &m_window;
    Gtk::Box m_card_box;
    LazyImage m_avatar;
    Gtk::Label m_name;
    Gtk::Box m_badges_box;
    Gtk::Label m_mute_badge;
    Gtk::Label m_deaf_badge;
    Gtk::Label m_live_badge;
    Gtk::Button m_watch_btn;
};

VoiceWindow::VoiceWindow(Snowflake channel_id)
    : m_root_box(Gtk::ORIENTATION_VERTICAL)
    , m_header_box(Gtk::ORIENTATION_HORIZONTAL)
    , m_toggle_sidebar("Members & Audio")
    , m_paned(Gtk::ORIENTATION_HORIZONTAL)
    , m_stage_box(Gtk::ORIENTATION_VERTICAL)
    , m_stream_switcher_box(Gtk::ORIENTATION_HORIZONTAL)
    , m_stream_player_box(Gtk::ORIENTATION_VERTICAL)
    , m_stream_player_overlay(Gtk::ORIENTATION_HORIZONTAL)
    , m_player_exit_btn("Stop Watching")
    , m_sidebar_box(Gtk::ORIENTATION_VERTICAL)
    , m_voice_dock(Gtk::ORIENTATION_HORIZONTAL)
    , m_dock_exit_stream_btn("Stop Watching")
    , m_mute("Mute")
    , m_deafen("Deafen")
    , m_stream("Share Screen")
    , m_noise_suppression("Suppress Noise")
    , m_mix_mono("Mix Mono")
    , m_disconnect("Disconnect")
    , m_stage_command("Request to Speak")
    , m_stage_invite_lbl("You've been invited to speak")
    , m_stage_accept("Accept")
    , m_stage_decline("Decline")
    , m_channel_id(channel_id)
    , m_menu_view("View")
    , m_menu_view_settings("More _Settings", true) {
    get_style_context()->add_class("app-window");
    get_style_context()->add_class("discord-voice-window");

    set_default_size(960, 640);

    auto &discord = Abaddon::Get().GetDiscordClient();
    auto &audio = Abaddon::Get().GetAudio();

    const auto channel = discord.GetChannel(m_channel_id);
    m_is_stage = channel.has_value() && channel->Type == ChannelType::GUILD_STAGE_VOICE;

    const std::string ch_name = (channel.has_value() && channel->Name.has_value()) ? *channel->Name : "Voice Channel";
    set_title(ch_name + " - Abaddon Voice");

    discord.signal_voice_user_disconnect().connect(sigc::mem_fun(*this, &VoiceWindow::OnUserDisconnect));
    discord.signal_voice_user_connect().connect(sigc::mem_fun(*this, &VoiceWindow::OnUserConnect));
    discord.signal_voice_speaker_state_changed().connect(sigc::mem_fun(*this, &VoiceWindow::OnSpeakerStateChanged));
    discord.signal_voice_state_set().connect(sigc::mem_fun(*this, &VoiceWindow::OnVoiceStateUpdate));
    discord.signal_stream_create().connect([this](const StreamCreateData &) {
        UpdateStreamSwitcher();
        UpdateHeader();
    });
    discord.signal_stream_delete().connect([this](const StreamDeleteData &) {
        UpdateStreamSwitcher();
        UpdateHeader();
    });

    SetUsers(discord.GetUsersInVoiceChannel(m_channel_id));

    if (const auto self_state = discord.GetVoiceState(discord.GetUserData().ID); self_state.has_value()) {
        m_mute.set_active(util::FlagSet(self_state->second.Flags, VoiceStateFlags::SelfMute));
        m_deafen.set_active(util::FlagSet(self_state->second.Flags, VoiceStateFlags::SelfDeaf));
        m_stream.set_active(util::FlagSet(self_state->second.Flags, VoiceStateFlags::SelfStream) || discord.IsStreaming());
    }

    m_mute.signal_toggled().connect(sigc::mem_fun(*this, &VoiceWindow::OnMuteChanged));
    m_deafen.signal_toggled().connect(sigc::mem_fun(*this, &VoiceWindow::OnDeafenChanged));
    m_stream.signal_toggled().connect([this]() {
        auto &discord = Abaddon::Get().GetDiscordClient();
        if (m_stream.get_active()) {
            discord.StartStream(m_channel_id);
        } else {
            discord.StopStream();
        }
        UpdateStreamSwitcher();
    });

    m_vad_value.SetShowTick(true);

    m_vad_param.set_range(0.0, 100.0);
    m_vad_param.set_value_pos(Gtk::POS_LEFT);
    m_vad_param.signal_value_changed().connect([this]() {
        auto &audio = Abaddon::Get().GetAudio();
        const double val = m_vad_param.get_value() * 0.01;
        switch (audio.GetVADMethod()) {
            case AudioManager::VADMethod::Gate:
                audio.SetCaptureGate(val);
                m_vad_value.SetTick(val);
                break;
#ifdef WITH_RNNOISE
            case AudioManager::VADMethod::RNNoise:
                audio.SetRNNProbThreshold(val);
                m_vad_value.SetTick(val);
                break;
#endif
        };
    });
    UpdateVADParamValue();

    m_capture_gain.set_range(0.0, 200.0);
    m_capture_gain.set_value_pos(Gtk::POS_LEFT);
    m_capture_gain.set_value(audio.GetCaptureGain() * 100.0);
    m_capture_gain.signal_value_changed().connect([this]() {
        const double val = m_capture_gain.get_value() / 100.0;
        Abaddon::Get().GetAudio().SetCaptureGain(val);
    });

    m_vad_combo.set_valign(Gtk::ALIGN_END);
    m_vad_combo.set_hexpand(true);
    m_vad_combo.set_halign(Gtk::ALIGN_FILL);
    m_vad_combo.set_tooltip_text(
        "Voice Activation Detection method\n"
        "Gate - Simple volume threshold. Slider changes threshold\n"
        "RNNoise - Heavier on CPU. Slider changes probability threshold");
    m_vad_combo.append("gate", "Gate");
#ifdef WITH_RNNOISE
    m_vad_combo.append("rnnoise", "RNNoise");
#endif
    if (!m_vad_combo.set_active_id(Abaddon::Get().GetSettings().VAD)) {
#ifdef WITH_RNNOISE
        m_vad_combo.set_active_id("rnnoise");
#else
        m_vad_combo.set_active_id("gate");
#endif
    }
    m_vad_combo.signal_changed().connect([this]() {
        auto &audio = Abaddon::Get().GetAudio();
        const auto id = m_vad_combo.get_active_id();

        audio.SetVADMethod(id);
        Abaddon::Get().GetSettings().VAD = id;
        UpdateVADParamValue();
    });

#ifdef WITH_RNNOISE
    m_noise_suppression.set_active(audio.GetSuppressNoise());
    m_noise_suppression.signal_toggled().connect([this]() {
        Abaddon::Get().GetAudio().SetSuppressNoise(m_noise_suppression.get_active());
    });
#endif

    m_mix_mono.set_active(audio.GetMixMono());
    m_mix_mono.signal_toggled().connect([this]() {
        Abaddon::Get().GetAudio().SetMixMono(m_mix_mono.get_active());
    });

    m_disconnect.signal_clicked().connect([this]() {
        Abaddon::Get().GetDiscordClient().DisconnectFromVoice();
    });

    auto *playback_renderer = Gtk::make_managed<Gtk::CellRendererText>();
    m_playback_combo.set_valign(Gtk::ALIGN_END);
    m_playback_combo.set_hexpand(true);
    m_playback_combo.set_halign(Gtk::ALIGN_FILL);
    m_playback_combo.set_model(audio.GetDevices().GetPlaybackDeviceModel());
    if (const auto iter = audio.GetDevices().GetActivePlaybackDevice()) {
        m_playback_combo.set_active(iter);
    }
    m_playback_combo.pack_start(*playback_renderer);
    m_playback_combo.add_attribute(*playback_renderer, "text", 0);
    m_playback_combo.signal_changed().connect([this]() {
        Abaddon::Get().GetAudio().SetPlaybackDevice(m_playback_combo.get_active());
    });

    auto *capture_renderer = Gtk::make_managed<Gtk::CellRendererText>();
    m_capture_combo.set_valign(Gtk::ALIGN_END);
    m_capture_combo.set_hexpand(true);
    m_capture_combo.set_halign(Gtk::ALIGN_FILL);
    m_capture_combo.set_model(Abaddon::Get().GetAudio().GetDevices().GetCaptureDeviceModel());
    if (const auto iter = Abaddon::Get().GetAudio().GetDevices().GetActiveCaptureDevice()) {
        m_capture_combo.set_active(iter);
    }
    m_capture_combo.pack_start(*capture_renderer);
    m_capture_combo.add_attribute(*capture_renderer, "text", 0);
    m_capture_combo.signal_changed().connect([this]() {
        Abaddon::Get().GetAudio().SetCaptureDevice(m_capture_combo.get_active());
    });

    m_menu_bar.append(m_menu_view);
    m_menu_view.set_submenu(m_menu_view_sub);
    m_menu_view_sub.append(m_menu_view_settings);
    m_menu_view_settings.signal_activate().connect([this]() {
        auto *window = new VoiceSettingsWindow;
        const auto cb = [this](double gain) {
            m_capture_gain.set_value(gain * 100.0);
            Abaddon::Get().GetAudio().SetCaptureGain(gain);
        };
        window->signal_gain().connect(sigc::track_obj(cb, *this));
        window->show();
    });

    auto *sliders_container = Gtk::make_managed<Gtk::HBox>();
    auto *sliders_labels = Gtk::make_managed<Gtk::VBox>();
    auto *sliders_sliders = Gtk::make_managed<Gtk::VBox>();
    sliders_container->pack_start(*sliders_labels, false, true, 2);
    sliders_container->pack_start(*sliders_sliders);
    sliders_labels->pack_start(*Gtk::make_managed<Gtk::Label>("Threshold", Gtk::ALIGN_END));
    sliders_labels->pack_start(*Gtk::make_managed<Gtk::Label>("Gain", Gtk::ALIGN_END));
    sliders_sliders->pack_start(m_vad_param);
    sliders_sliders->pack_start(m_capture_gain);

    auto *combos_container = Gtk::make_managed<Gtk::HBox>();
    auto *combos_labels = Gtk::make_managed<Gtk::VBox>();
    auto *combos_combos = Gtk::make_managed<Gtk::VBox>();
    combos_container->pack_start(*combos_labels, false, true, 6);
    combos_container->pack_start(*combos_combos, Gtk::PACK_EXPAND_WIDGET, 6);
    combos_labels->pack_start(*Gtk::make_managed<Gtk::Label>("VAD Method", Gtk::ALIGN_END));
    combos_labels->pack_start(*Gtk::make_managed<Gtk::Label>("Output Device", Gtk::ALIGN_END));
    combos_labels->pack_start(*Gtk::make_managed<Gtk::Label>("Input Device", Gtk::ALIGN_END));
    combos_combos->pack_start(m_vad_combo);
    combos_combos->pack_start(m_playback_combo);
    combos_combos->pack_start(m_capture_combo);

    if (const auto instance = discord.GetStageInstanceFromChannel(channel_id); instance.has_value()) {
        m_stage_topic_label.show();
        UpdateStageTopicLabel(instance->Topic);
    } else {
        m_stage_topic_label.hide();
    }

    discord.signal_stage_instance_create().connect(sigc::mem_fun(*this, &VoiceWindow::OnStageInstanceCreate));
    discord.signal_stage_instance_update().connect(sigc::mem_fun(*this, &VoiceWindow::OnStageInstanceUpdate));
    discord.signal_stage_instance_delete().connect(sigc::mem_fun(*this, &VoiceWindow::OnStageInstanceDelete));

    m_stage_command.signal_clicked().connect([this]() {
        auto &discord = Abaddon::Get().GetDiscordClient();
        const auto user_id = discord.GetUserData().ID;
        const bool is_moderator = discord.IsStageModerator(user_id, m_channel_id);
        const bool is_speaker = discord.IsUserSpeaker(user_id);
        const bool is_invited_to_speak = discord.IsUserInvitedToSpeak(user_id);

        if (is_speaker) {
            discord.SetStageSpeaking(m_channel_id, false, NOOP_CALLBACK);
        } else if (is_moderator) {
            discord.SetStageSpeaking(m_channel_id, true, NOOP_CALLBACK);
        } else if (is_invited_to_speak) {
            discord.DeclineInviteToSpeak(m_channel_id, NOOP_CALLBACK);
        } else {
            const bool requested = discord.HasUserRequestedToSpeak(user_id);
            discord.RequestToSpeak(m_channel_id, !requested, NOOP_CALLBACK);
        }
    });

    m_stage_accept.signal_clicked().connect([this]() {
        Abaddon::Get().GetDiscordClient().SetStageSpeaking(m_channel_id, true, NOOP_CALLBACK);
    });

    m_stage_decline.signal_clicked().connect([this]() {
        Abaddon::Get().GetDiscordClient().DeclineInviteToSpeak(m_channel_id, NOOP_CALLBACK);
    });

    // --- Header ---
    m_header_box.get_style_context()->add_class("discord-voice-header");
    m_header_title.get_style_context()->add_class("discord-voice-title");
    m_header_status.get_style_context()->add_class("discord-voice-status");
    m_header_box.pack_start(m_header_title, false, false, 8);
    m_header_box.pack_start(m_header_status, false, false, 8);

    auto *header_spacer = Gtk::make_managed<Gtk::Box>();
    m_header_box.pack_start(*header_spacer, true, true);

    m_toggle_sidebar.set_active(true);
    m_toggle_sidebar.signal_toggled().connect([this]() {
        m_sidebar_scroll.set_visible(m_toggle_sidebar.get_active());
    });
    m_header_box.pack_start(m_toggle_sidebar, false, false, 4);

    // --- Stage Area: Switcher, Stack (Grid & Player) ---
    m_stream_bar_scroll.set_policy(Gtk::POLICY_AUTOMATIC, Gtk::POLICY_NEVER);
    m_stream_bar_scroll.get_style_context()->add_class("stream-switcher-bar");
    m_stream_bar_scroll.add(m_stream_switcher_box);
    m_stream_bar_scroll.set_no_show_all(true);
    m_stream_bar_scroll.hide();

    // Stream Player
    m_stream_player_overlay.get_style_context()->add_class("stream-player-bar");
    m_player_title.set_halign(Gtk::ALIGN_START);
    m_player_status.set_halign(Gtk::ALIGN_START);
    m_player_exit_btn.get_style_context()->add_class("stream-exit-btn");
    m_player_exit_btn.signal_clicked().connect(sigc::mem_fun(*this, &VoiceWindow::ExitStream));

    m_stream_player_overlay.pack_start(m_player_title, false, false, 8);
    m_stream_player_overlay.pack_start(m_player_status, false, false, 8);
    auto *player_overlay_spacer = Gtk::make_managed<Gtk::Box>();
    m_stream_player_overlay.pack_start(*player_overlay_spacer, true, true);
    m_stream_player_overlay.pack_start(m_player_exit_btn, false, false, 4);

    m_stream_canvas.set_hexpand(true);
    m_stream_canvas.set_vexpand(true);
    m_stream_canvas.signal_draw().connect(sigc::mem_fun(*this, &VoiceWindow::OnDrawStreamCanvas));

    m_stream_player_box.pack_start(m_stream_player_overlay, false, false);
    m_stream_player_box.pack_start(m_stream_canvas, true, true);

    // Participant Grid
    m_grid_flowbox.set_valign(Gtk::ALIGN_START);
    m_grid_flowbox.set_halign(Gtk::ALIGN_FILL);
    m_grid_flowbox.set_min_children_per_line(1);
    m_grid_flowbox.set_max_children_per_line(6);
    m_grid_flowbox.set_selection_mode(Gtk::SELECTION_NONE);
    m_grid_flowbox.set_row_spacing(12);
    m_grid_flowbox.set_column_spacing(12);
    m_grid_flowbox.set_margin_left(16);
    m_grid_flowbox.set_margin_right(16);
    m_grid_flowbox.set_margin_top(16);
    m_grid_flowbox.set_margin_bottom(16);

    m_grid_scrolled.set_policy(Gtk::POLICY_NEVER, Gtk::POLICY_AUTOMATIC);
    m_grid_scrolled.set_hexpand(true);
    m_grid_scrolled.set_vexpand(true);
    m_grid_scrolled.add(m_grid_flowbox);

    m_stage_stack.add(m_grid_scrolled, "grid");
    m_stage_stack.add(m_stream_player_box, "player");
    m_stage_stack.set_visible_child("grid");

    m_stage_box.pack_start(m_stream_bar_scroll, false, false);
    m_stage_box.pack_start(m_stage_stack, true, true);

    // --- Sidebar ---
    m_sidebar_box.get_style_context()->add_class("voice-sidebar");
    m_sidebar_box.set_size_request(280, -1);

    m_sidebar_box.pack_start(m_menu_bar, false, true);

    if (m_is_stage) {
        m_stage_topic_label.set_ellipsize(Pango::ELLIPSIZE_END);
        m_stage_topic_label.set_halign(Gtk::ALIGN_CENTER);
        m_sidebar_box.pack_start(m_stage_topic_label, false, true);

        m_stage_invite_box.pack_start(m_stage_invite_lbl, false, true);
        m_stage_invite_box.pack_start(m_stage_invite_btns);
        m_stage_invite_btns.set_halign(Gtk::ALIGN_CENTER);
        m_stage_invite_btns.pack_start(m_stage_accept, false, true);
        m_stage_invite_btns.pack_start(m_stage_decline, false, true);
        m_sidebar_box.pack_start(m_stage_invite_box, false, true);
    }

    auto *members_heading = Gtk::make_managed<Gtk::Label>();
    members_heading->set_markup("<b>Members</b>");
    members_heading->set_halign(Gtk::ALIGN_START);
    members_heading->set_margin_top(8);
    members_heading->set_margin_bottom(4);
    m_sidebar_box.pack_start(*members_heading, false, false);

    m_speakers_label.set_markup("<b>Speakers</b>");
    if (m_is_stage) m_listing.pack_start(m_speakers_label, false, true);
    m_listing.pack_start(m_speakers_list, false, true);
    m_audience_label.set_markup("<b>Audience</b>");
    if (m_is_stage) m_listing.pack_start(m_audience_label, false, true);
    if (m_is_stage) m_listing.pack_start(m_audience_list, false, true);

    m_scroll.set_policy(Gtk::POLICY_NEVER, Gtk::POLICY_AUTOMATIC);
    m_scroll.set_hexpand(true);
    m_scroll.set_vexpand(true);
    m_scroll.set_size_request(-1, 160);
    m_scroll.add(m_listing);
    m_sidebar_box.pack_start(m_scroll, true, true);

    auto *audio_heading = Gtk::make_managed<Gtk::Label>();
    audio_heading->set_markup("<b>Audio Settings</b>");
    audio_heading->set_halign(Gtk::ALIGN_START);
    audio_heading->set_margin_top(12);
    audio_heading->set_margin_bottom(4);
    m_sidebar_box.pack_start(*audio_heading, false, false);

    m_sidebar_box.pack_start(m_vad_value, false, true);
    m_sidebar_box.pack_start(*sliders_container, false, true);
    m_sidebar_box.pack_start(*combos_container, false, true, 2);

    auto *misc_audio_box = Gtk::make_managed<Gtk::Box>(Gtk::ORIENTATION_HORIZONTAL, 8);
#ifdef WITH_RNNOISE
    misc_audio_box->pack_start(m_noise_suppression, false, false);
#endif
    misc_audio_box->pack_start(m_mix_mono, false, false);
    m_sidebar_box.pack_start(*misc_audio_box, false, false);

    m_sidebar_scroll.set_policy(Gtk::POLICY_NEVER, Gtk::POLICY_AUTOMATIC);
    m_sidebar_scroll.add(m_sidebar_box);

    // --- Paned ---
    m_paned.pack1(m_stage_box, true, false);
    m_paned.pack2(m_sidebar_scroll, false, false);
    m_paned.set_position(660);

    // --- Bottom Voice Dock ---
    m_voice_dock.get_style_context()->add_class("discord-voice-dock");
    m_voice_dock.set_halign(Gtk::ALIGN_CENTER);
    m_voice_dock.set_spacing(12);

    m_voice_dock.pack_start(m_mute, false, false);
    m_voice_dock.pack_start(m_deafen, false, false);
    m_voice_dock.pack_start(m_stream, false, false);

    m_dock_exit_stream_btn.get_style_context()->add_class("stream-exit-btn");
    m_dock_exit_stream_btn.set_no_show_all(true);
    m_dock_exit_stream_btn.hide();
    m_dock_exit_stream_btn.signal_clicked().connect(sigc::mem_fun(*this, &VoiceWindow::ExitStream));
    m_voice_dock.pack_start(m_dock_exit_stream_btn, false, false);

    if (m_is_stage) {
        m_voice_dock.pack_start(m_stage_command, false, false);
    }

    m_disconnect.get_style_context()->add_class("discord-disconnect-btn");
    m_voice_dock.pack_start(m_disconnect, false, false);

    // --- Assemble Root ---
    m_root_box.pack_start(m_header_box, false, false);
    m_root_box.pack_start(m_paned, true, true);
    m_root_box.pack_start(m_voice_dock, false, false);

    add(m_root_box);
    show_all_children();

    Glib::signal_timeout().connect(sigc::mem_fun(*this, &VoiceWindow::UpdateVoiceMeters), 40);

    UpdateStageCommand();
    UpdateHeader();
    UpdateStreamSwitcher();
}

VoiceWindow::~VoiceWindow() {
    if (m_active_stream_user.IsValid()) {
        Abaddon::Get().GetDiscordClient().WatchStream("");
    }
}

void VoiceWindow::SetUsers(const std::unordered_set<Snowflake> &user_ids) {
    auto &discord = Abaddon::Get().GetDiscordClient();
    const auto me = discord.GetUserData().ID;
    for (auto id : user_ids) {
        if (!m_is_stage || discord.IsUserSpeaker(id)) {
            if (id != me) m_speakers_list.add(*CreateSpeakerRow(id));
        } else {
            m_audience_list.add(*CreateAudienceRow(id));
        }
        AddParticipantCard(id);
    }
    if (me.IsValid() && discord.GetVoiceChannelID() == m_channel_id) {
        AddParticipantCard(me);
    }
    UpdateStreamSwitcher();
    UpdateHeader();
}

void VoiceWindow::AddParticipantCard(Snowflake id) {
    if (!id.IsValid()) return;
    if (m_grid_cards.find(id) != m_grid_cards.end()) return;

    auto *card = Gtk::make_managed<VoiceParticipantCard>(id, *this);
    m_grid_cards[id] = card;
    m_grid_flowbox.add(*card);
    card->show_all();
}

void VoiceWindow::RemoveParticipantCard(Snowflake id) {
    if (auto it = m_grid_cards.find(id); it != m_grid_cards.end()) {
        delete it->second;
        m_grid_cards.erase(it);
    }
}

Gtk::ListBoxRow *VoiceWindow::CreateSpeakerRow(Snowflake id) {
    auto *row = Gtk::make_managed<VoiceWindowSpeakerListEntry>(id);
    m_rows[id] = row;
    auto &vc = Abaddon::Get().GetDiscordClient().GetVoiceClient();
    row->RestoreGain(vc.GetUserVolume(id));
    row->signal_mute_cs().connect([this, id](bool is_muted) {
        m_signal_mute_user_cs.emit(id, is_muted);
    });
    row->signal_volume().connect([this, id](double volume) {
        m_signal_user_volume_changed.emit(id, volume);
    });
    row->signal_watch_stream().connect([this, id]() {
        SelectStream(id);
    });
    row->show();
    return row;
}

Gtk::ListBoxRow *VoiceWindow::CreateAudienceRow(Snowflake id) {
    auto *row = Gtk::make_managed<VoiceWindowAudienceListEntry>(id);
    m_rows[id] = row;
    row->signal_watch_stream().connect([this, id]() {
        SelectStream(id);
    });
    row->show();
    return row;
}

void VoiceWindow::SelectStream(Snowflake user_id) {
    if (!user_id.IsValid()) return;
    m_active_stream_user = user_id;

    auto &discord = Abaddon::Get().GetDiscordClient();
    const auto key = discord.MakeStreamKey(m_channel_id, user_id);
    discord.WatchStream(key);

    m_stage_stack.set_visible_child("player");
    m_dock_exit_stream_btn.show();

    std::string name = "User";
    if (const auto user = discord.GetUser(user_id); user.has_value()) {
        name = user->GetUsername();
    }
    m_player_title.set_markup("<big><b>" + Glib::Markup::escape_text(name) + "'s Stream</b></big>");
    m_player_status.set_markup("<span font_weight=\"bold\" color=\"#f23f43\">● LIVE</span> 720p 60fps");

    UpdateStreamSwitcher();
    UpdateHeader();
    m_stream_canvas.queue_draw();
}

void VoiceWindow::ExitStream() {
    if (!m_active_stream_user.IsValid()) return;
    m_active_stream_user = Snowflake::Invalid;

    auto &discord = Abaddon::Get().GetDiscordClient();
    discord.WatchStream("");

    m_stage_stack.set_visible_child("grid");
    m_dock_exit_stream_btn.hide();

    UpdateStreamSwitcher();
    UpdateHeader();
}

void VoiceWindow::UpdateStreamSwitcher() {
    for (auto *child : m_stream_switcher_box.get_children()) {
        delete child;
    }

    auto &discord = Abaddon::Get().GetDiscordClient();
    auto users = discord.GetUsersInVoiceChannel(m_channel_id);
    std::vector<Snowflake> streaming_users;

    for (auto id : users) {
        if (discord.IsUserStreaming(id)) {
            streaming_users.push_back(id);
        }
    }
    const auto me = discord.GetUserData().ID;
    if (me.IsValid() && discord.GetVoiceChannelID() == m_channel_id && discord.IsUserStreaming(me)) {
        if (std::find(streaming_users.begin(), streaming_users.end(), me) == streaming_users.end()) {
            streaming_users.push_back(me);
        }
    }

    if (streaming_users.empty()) {
        m_stream_bar_scroll.hide();
        return;
    }

    m_stream_bar_scroll.show();

    auto *lbl = Gtk::make_managed<Gtk::Label>("Active Streams:");
    lbl->get_style_context()->add_class("dim-label");
    m_stream_switcher_box.pack_start(*lbl, false, false, 4);

    for (auto id : streaming_users) {
        std::string name = "User " + std::to_string(static_cast<uint64_t>(id));
        if (const auto user = discord.GetUser(id); user.has_value()) {
            name = user->GetUsername();
        }

        auto *btn = Gtk::make_managed<Gtk::Button>();
        btn->get_style_context()->add_class("stream-card-btn");

        auto *box = Gtk::make_managed<Gtk::Box>(Gtk::ORIENTATION_HORIZONTAL, 6);
        auto *live_lbl = Gtk::make_managed<Gtk::Label>("LIVE");
        live_lbl->get_style_context()->add_class("badge-live");
        auto *name_lbl = Gtk::make_managed<Gtk::Label>(name);

        box->pack_start(*live_lbl, false, false);
        box->pack_start(*name_lbl, false, false);
        btn->add(*box);

        if (m_active_stream_user == id) {
            btn->get_style_context()->add_class("active");
        }

        btn->signal_clicked().connect([this, id]() {
            SelectStream(id);
        });

        m_stream_switcher_box.pack_start(*btn, false, false, 4);
    }

    if (m_active_stream_user.IsValid()) {
        auto *exit_btn = Gtk::make_managed<Gtk::Button>("✕ Exit Stream");
        exit_btn->get_style_context()->add_class("stream-exit-btn");
        exit_btn->signal_clicked().connect([this]() {
            ExitStream();
        });
        m_stream_switcher_box.pack_start(*exit_btn, false, false, 8);
    }

    m_stream_switcher_box.show_all();
}

void VoiceWindow::UpdateParticipantGrid() {
    auto &discord = Abaddon::Get().GetDiscordClient();
    const auto users = discord.GetUsersInVoiceChannel(m_channel_id);
    for (auto id : users) {
        AddParticipantCard(id);
    }
    const auto me = discord.GetUserData().ID;
    if (me.IsValid() && discord.GetVoiceChannelID() == m_channel_id) {
        AddParticipantCard(me);
    }
}

void VoiceWindow::UpdateHeader() {
    auto &discord = Abaddon::Get().GetDiscordClient();
    std::string channel_name = "Voice Channel";
    if (const auto chan = discord.GetChannel(m_channel_id); chan.has_value() && chan->Name.has_value()) {
        channel_name = *chan->Name;
    }

    m_header_title.set_markup("<b>🔊 " + Glib::Markup::escape_text(channel_name) + "</b>");

    if (m_active_stream_user.IsValid()) {
        std::string streamer = "User";
        if (const auto user = discord.GetUser(m_active_stream_user); user.has_value()) {
            streamer = user->GetUsername();
        }
        m_header_status.set_markup("<span color=\"#f23f43\" font_weight=\"bold\">🔴 LIVE</span> Watching " + Glib::Markup::escape_text(streamer) + "'s stream");
    } else {
        const auto users = discord.GetUsersInVoiceChannel(m_channel_id);
        m_header_status.set_text("Connected • " + std::to_string(users.size()) + " users in voice");
    }
}

bool VoiceWindow::OnDrawStreamCanvas(const Cairo::RefPtr<Cairo::Context> &cr) {
    const int w = m_stream_canvas.get_allocated_width();
    const int h = m_stream_canvas.get_allocated_height();

    // Dark sleek background
    cr->set_source_rgb(0.07, 0.07, 0.08); // #111214
    cr->paint();

    // Inner rounded container
    const double margin = 16.0;
    const double rw = std::max(10.0, w - margin * 2.0);
    const double rh = std::max(10.0, h - margin * 2.0);
    const double radius = 12.0;

    cr->save();
    CairoUtil::PathRoundedRect(cr, margin, margin, rw, rh, radius);
    cr->set_source_rgb(0.12, 0.12, 0.14); // #1e1f22
    cr->fill_preserve();
    cr->set_source_rgba(1.0, 1.0, 1.0, 0.06);
    cr->set_line_width(1.5);
    cr->stroke();
    cr->restore();

    // Center avatar circle & glowing pulse ring
    const double cx = w / 2.0;
    const double cy = h / 2.0 - 30.0;
    const double r = 44.0;

    // Glowing outer ring (Discord Live Red glow)
    cr->set_source_rgba(0.95, 0.25, 0.26, 0.25);
    cr->arc(cx, cy, r + 8.0, 0, 2.0 * M_PI);
    cr->fill();

    cr->set_source_rgb(0.95, 0.25, 0.26); // red border
    cr->set_line_width(3.0);
    cr->arc(cx, cy, r + 2.0, 0, 2.0 * M_PI);
    cr->stroke();

    // Inner avatar circle
    cr->set_source_rgb(0.35, 0.40, 0.95); // Discord blurple #5865f2
    cr->arc(cx, cy, r, 0, 2.0 * M_PI);
    cr->fill();

    // Streamer info
    auto &discord = Abaddon::Get().GetDiscordClient();
    std::string streamer_name = "User";
    if (m_active_stream_user.IsValid()) {
        if (const auto user = discord.GetUser(m_active_stream_user); user.has_value()) {
            streamer_name = user->GetUsername();
        }
    }

    // Avatar initial letter
    std::string initial = streamer_name.empty() ? "?" : streamer_name.substr(0, 1);
    cr->set_source_rgb(1.0, 1.0, 1.0);
    cr->select_font_face("Sans", Cairo::FONT_SLANT_NORMAL, Cairo::FONT_WEIGHT_BOLD);
    cr->set_font_size(32.0);
    Cairo::TextExtents te_init;
    cr->get_text_extents(initial, te_init);
    cr->move_to(cx - te_init.width / 2.0 - te_init.x_bearing, cy - te_init.height / 2.0 - te_init.y_bearing);
    cr->show_text(initial);

    // Streamer Name
    cr->set_font_size(18.0);
    Cairo::TextExtents te_name;
    cr->get_text_extents(streamer_name, te_name);
    cr->move_to(cx - te_name.width / 2.0 - te_name.x_bearing, cy + r + 35.0);
    cr->show_text(streamer_name);

    // Live Badge pill
    const std::string live_badge = "LIVE • 720p 60fps";
    cr->set_font_size(12.0);
    Cairo::TextExtents te_live;
    cr->get_text_extents(live_badge, te_live);
    const double badge_w = te_live.width + 16.0;
    const double badge_h = 22.0;
    const double badge_x = cx - badge_w / 2.0;
    const double badge_y = cy + r + 50.0;

    cr->save();
    CairoUtil::PathRoundedRect(cr, badge_x, badge_y, badge_w, badge_h, 4.0);
    cr->set_source_rgb(0.95, 0.25, 0.26);
    cr->fill();
    cr->restore();

    cr->set_source_rgb(1.0, 1.0, 1.0);
    cr->move_to(badge_x + 8.0, badge_y + 15.0);
    cr->show_text(live_badge);

    // Subtitle
    cr->set_source_rgba(1.0, 1.0, 1.0, 0.6);
    cr->set_font_size(13.0);
    const std::string stream_msg = "Stream session active • Receiving voice and stream signaling";
    Cairo::TextExtents te_msg;
    cr->get_text_extents(stream_msg, te_msg);
    cr->move_to(cx - te_msg.width / 2.0 - te_msg.x_bearing, badge_y + badge_h + 26.0);
    cr->show_text(stream_msg);

    return true;
}

void VoiceWindow::OnMuteChanged() {
    m_signal_mute.emit(m_mute.get_active());
}

void VoiceWindow::OnDeafenChanged() {
    m_signal_deafen.emit(m_deafen.get_active());
}

void VoiceWindow::TryDeleteRow(Snowflake id) {
    if (auto it = m_rows.find(id); it != m_rows.end()) {
        delete it->second;
        m_rows.erase(it);
    }
}

bool VoiceWindow::UpdateVoiceMeters() {
    auto &audio = Abaddon::Get().GetAudio();
    switch (audio.GetVADMethod()) {
        case AudioManager::VADMethod::Gate:
            m_vad_value.SetVolume(audio.GetCaptureVolumeLevel());
            break;
#ifdef WITH_RNNOISE
        case AudioManager::VADMethod::RNNoise:
            m_vad_value.SetVolume(audio.GetCurrentVADProbability());
            break;
#endif
    }

    // Update self speaking state in participant grid
    const auto me = Abaddon::Get().GetDiscordClient().GetUserData().ID;
    if (auto it = m_grid_cards.find(me); it != m_grid_cards.end()) {
        const double capture_level = audio.GetCaptureVolumeLevel();
        const double threshold = m_vad_param.get_value() * 0.01;
        it->second->SetSpeaking(!m_mute.get_active() && capture_level > threshold && capture_level > 0.05);
    }

    // Update other participants speaking state in participant grid & list
    for (auto [id, row] : m_rows) {
        const auto ssrc = Abaddon::Get().GetDiscordClient().GetSSRCOfUser(id);
        if (ssrc.has_value()) {
            const double vol = audio.GetSSRCVolumeLevel(*ssrc);
            if (auto *speaker_row = dynamic_cast<VoiceWindowSpeakerListEntry *>(row)) {
                speaker_row->SetVolumeMeter(vol);
            }
            if (auto card_it = m_grid_cards.find(id); card_it != m_grid_cards.end()) {
                card_it->second->SetSpeaking(vol > 0.02);
            }
        } else {
            if (auto card_it = m_grid_cards.find(id); card_it != m_grid_cards.end()) {
                card_it->second->SetSpeaking(false);
            }
        }
    }
    return true;
}

void VoiceWindow::UpdateVADParamValue() {
    auto &audio = Abaddon::Get().GetAudio();
    switch (audio.GetVADMethod()) {
        case AudioManager::VADMethod::Gate:
            m_vad_param.set_value(audio.GetCaptureGate() * 100.0);
            break;
#ifdef WITH_RNNOISE
        case AudioManager::VADMethod::RNNoise:
            m_vad_param.set_value(audio.GetRNNProbThreshold() * 100.0);
            break;
#endif
    }
}

void VoiceWindow::UpdateStageCommand() {
    auto &discord = Abaddon::Get().GetDiscordClient();
    const auto user_id = discord.GetUserData().ID;

    m_has_requested_to_speak = discord.HasUserRequestedToSpeak(user_id);
    const bool is_moderator = discord.IsStageModerator(user_id, m_channel_id);
    const bool is_speaker = discord.IsUserSpeaker(user_id);
    const bool is_invited_to_speak = discord.IsUserInvitedToSpeak(user_id);

    m_stage_invite_box.set_visible(is_invited_to_speak);

    if (is_speaker) {
        m_stage_command.set_label("Leave the Stage");
    } else if (is_moderator) {
        m_stage_command.set_label("Speak on Stage");
    } else if (m_has_requested_to_speak) {
        m_stage_command.set_label("Cancel Request");
    } else if (is_invited_to_speak) {
        m_stage_command.set_label("Decline Invite");
    } else {
        m_stage_command.set_label("Request to Speak");
    }
}

void VoiceWindow::UpdateStageTopicLabel(const std::string &topic) {
    m_stage_topic_label.set_markup("Topic: " + topic);
}

void VoiceWindow::OnUserConnect(Snowflake user_id, Snowflake to_channel_id) {
    if (m_channel_id == to_channel_id) {
        if (auto it = m_rows.find(user_id); it == m_rows.end()) {
            if (Abaddon::Get().GetDiscordClient().IsUserSpeaker(user_id)) {
                m_speakers_list.add(*CreateSpeakerRow(user_id));
            } else {
                m_audience_list.add(*CreateAudienceRow(user_id));
            }
        }
        AddParticipantCard(user_id);
        UpdateStreamSwitcher();
        UpdateHeader();
    }
}

void VoiceWindow::OnUserDisconnect(Snowflake user_id, Snowflake from_channel_id) {
    if (m_channel_id == from_channel_id) {
        TryDeleteRow(user_id);
        RemoveParticipantCard(user_id);
        if (m_active_stream_user == user_id) {
            ExitStream();
        }
        UpdateStreamSwitcher();
        UpdateHeader();
    }
}

void VoiceWindow::OnSpeakerStateChanged(Snowflake channel_id, Snowflake user_id, bool is_speaker) {
    if (m_channel_id != channel_id) return;
    TryDeleteRow(user_id);
    if (is_speaker) {
        m_speakers_list.add(*CreateSpeakerRow(user_id));
    } else {
        m_audience_list.add(*CreateAudienceRow(user_id));
    }
}

void VoiceWindow::OnVoiceStateUpdate(Snowflake user_id, Snowflake channel_id, VoiceStateFlags flags) {
    auto &discord = Abaddon::Get().GetDiscordClient();
    if (user_id == discord.GetUserData().ID) {
        m_stream.set_active(util::FlagSet(flags, VoiceStateFlags::SelfStream) || discord.IsStreaming());
        UpdateStageCommand();
    }

    if (auto it = m_rows.find(user_id); it != m_rows.end()) {
        const bool is_streaming = util::FlagSet(flags, VoiceStateFlags::SelfStream);
        if (auto speaker = dynamic_cast<VoiceWindowSpeakerListEntry *>(it->second)) {
            speaker->SetStreaming(is_streaming);
        } else if (auto audience = dynamic_cast<VoiceWindowAudienceListEntry *>(it->second)) {
            audience->SetStreaming(is_streaming);
        }
    }

    if (auto it = m_grid_cards.find(user_id); it != m_grid_cards.end()) {
        it->second->SetStreaming(util::FlagSet(flags, VoiceStateFlags::SelfStream));
        it->second->SetMuted(util::FlagSet(flags, VoiceStateFlags::Mute | VoiceStateFlags::SelfMute));
        it->second->SetDeafened(util::FlagSet(flags, VoiceStateFlags::Deaf | VoiceStateFlags::SelfDeaf));
    } else if (channel_id == m_channel_id) {
        AddParticipantCard(user_id);
    }

    if (m_active_stream_user == user_id && !util::FlagSet(flags, VoiceStateFlags::SelfStream)) {
        ExitStream();
    }

    UpdateStreamSwitcher();
    UpdateHeader();
}

void VoiceWindow::OnStageInstanceCreate(const StageInstance &instance) {
    m_stage_topic_label.show();
    UpdateStageTopicLabel(instance.Topic);
}

void VoiceWindow::OnStageInstanceUpdate(const StageInstance &instance) {
    UpdateStageTopicLabel(instance.Topic);
}

void VoiceWindow::OnStageInstanceDelete(const StageInstance &instance) {
    m_stage_topic_label.hide();
}

VoiceWindow::type_signal_mute VoiceWindow::signal_mute() {
    return m_signal_mute;
}

VoiceWindow::type_signal_deafen VoiceWindow::signal_deafen() {
    return m_signal_deafen;
}

VoiceWindow::type_signal_mute_user_cs VoiceWindow::signal_mute_user_cs() {
    return m_signal_mute_user_cs;
}

VoiceWindow::type_signal_user_volume_changed VoiceWindow::signal_user_volume_changed() {
    return m_signal_user_volume_changed;
}
#endif
