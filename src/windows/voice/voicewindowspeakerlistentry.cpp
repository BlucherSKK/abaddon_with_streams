#include "voicewindowspeakerlistentry.hpp"

#include "abaddon.hpp"

VoiceWindowSpeakerListEntry::VoiceWindowSpeakerListEntry(Snowflake id)
    : m_id(id)
    , m_main(Gtk::ORIENTATION_VERTICAL)
    , m_horz(Gtk::ORIENTATION_HORIZONTAL)
    , m_avatar(32, 32)
    , m_stream_btn("Live")
    , m_mute("Mute") {
    m_name.set_halign(Gtk::ALIGN_START);
    m_name.set_hexpand(true);
    m_mute.set_halign(Gtk::ALIGN_END);

    m_stream_btn.set_tooltip_text("User is streaming. Click to watch");
    m_stream_btn.set_no_show_all(true);
    m_stream_btn.signal_clicked().connect([this]() {
        auto &discord = Abaddon::Get().GetDiscordClient();
        const auto channel_id = discord.GetVoiceChannelID();
        if (channel_id.IsValid()) {
            const auto stream_key = discord.MakeStreamKey(channel_id, m_id);
            discord.WatchStream(stream_key);
        }
    });

    m_volume.set_range(0.0, 200.0);
    m_volume.set_value_pos(Gtk::POS_LEFT);
    m_volume.set_value(100.0);
    m_volume.signal_value_changed().connect([this]() {
        m_signal_volume.emit(m_volume.get_value() * 0.01);
    });

    m_horz.add(m_avatar);
    m_horz.add(m_name);
    m_horz.add(m_stream_btn);
    m_horz.add(m_mute);
    m_main.add(m_horz);
    m_main.add(m_volume);
    m_main.add(m_meter);
    add(m_main);
    show_all_children();

    auto &discord = Abaddon::Get().GetDiscordClient();
    const auto user = discord.GetUser(id);
    if (user.has_value()) {
        m_name.set_text(user->GetUsername());
        m_avatar.SetURL(user->GetAvatarURL("png", "32"));
    } else {
        m_name.set_text("Unknown user");
    }

    if (const auto state = discord.GetVoiceState(id); state.has_value()) {
        SetStreaming(util::FlagSet(state->second.Flags, VoiceStateFlags::SelfStream));
    }

    m_mute.signal_toggled().connect([this]() {
        m_signal_mute_cs.emit(m_mute.get_active());
    });
}

void VoiceWindowSpeakerListEntry::SetStreaming(bool is_streaming) {
    if (is_streaming) {
        m_stream_btn.show();
    } else {
        m_stream_btn.hide();
    }
}

void VoiceWindowSpeakerListEntry::SetVolumeMeter(double frac) {
    m_meter.SetVolume(frac);
}

void VoiceWindowSpeakerListEntry::RestoreGain(double frac) {
    m_volume.set_value(frac * 100.0);
}

VoiceWindowSpeakerListEntry::type_signal_mute_cs VoiceWindowSpeakerListEntry::signal_mute_cs() {
    return m_signal_mute_cs;
}

VoiceWindowSpeakerListEntry::type_signal_volume VoiceWindowSpeakerListEntry::signal_volume() {
    return m_signal_volume;
}
