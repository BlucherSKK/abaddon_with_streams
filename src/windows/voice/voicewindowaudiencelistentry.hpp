#pragma once

#include "components/lazyimage.hpp"
#include "discord/snowflake.hpp"

#include <gtkmm/box.h>
#include <gtkmm/button.h>
#include <gtkmm/label.h>
#include <gtkmm/listboxrow.h>

class VoiceWindowAudienceListEntry : public Gtk::ListBoxRow {
public:
    VoiceWindowAudienceListEntry(Snowflake id);

    void SetStreaming(bool is_streaming);

    using type_signal_watch_stream = sigc::signal<void()>;
    type_signal_watch_stream signal_watch_stream();

private:
    Snowflake m_id;
    Gtk::Box m_main;
    LazyImage m_avatar;
    Gtk::Label m_name;
    Gtk::Button m_stream_btn;

    type_signal_watch_stream m_signal_watch_stream;
};
