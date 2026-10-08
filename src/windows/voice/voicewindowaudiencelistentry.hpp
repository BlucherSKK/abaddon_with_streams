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

private:
    Snowflake m_id;
    Gtk::Box m_main;
    LazyImage m_avatar;
    Gtk::Label m_name;
    Gtk::Button m_stream_btn;
};
