#include "voicewindowaudiencelistentry.hpp"
#include "abaddon.hpp"

VoiceWindowAudienceListEntry::VoiceWindowAudienceListEntry(Snowflake id)
    : m_id(id)
    , m_main(Gtk::ORIENTATION_HORIZONTAL)
    , m_avatar(32, 32)
    , m_stream_btn("Live") {
    m_name.set_halign(Gtk::ALIGN_START);
    m_name.set_hexpand(true);

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

    m_main.add(m_avatar);
    m_main.add(m_name);
    m_main.add(m_stream_btn);
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
}

void VoiceWindowAudienceListEntry::SetStreaming(bool is_streaming) {
    if (is_streaming) {
        m_stream_btn.show();
    } else {
        m_stream_btn.hide();
    }
}
