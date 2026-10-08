#pragma once

#include "components/lazyimage.hpp"
#include "components/volumemeter.hpp"
#include "discord/snowflake.hpp"

#include <gtkmm/box.h>
#include <gtkmm/button.h>
#include <gtkmm/checkbutton.h>
#include <gtkmm/label.h>
#include <gtkmm/listboxrow.h>
#include <gtkmm/scale.h>

class VoiceWindowSpeakerListEntry : public Gtk::ListBoxRow {
public:
    VoiceWindowSpeakerListEntry(Snowflake id);

    void SetVolumeMeter(double frac);
    void RestoreGain(double frac);
    void SetStreaming(bool is_streaming);

private:
    Snowflake m_id;
    Gtk::Box m_main;
    Gtk::Box m_horz;
    LazyImage m_avatar;
    Gtk::Label m_name;
    Gtk::Button m_stream_btn;
    Gtk::CheckButton m_mute;
    Gtk::Scale m_volume;
    VolumeMeter m_meter;

public:
    using type_signal_mute_cs = sigc::signal<void(bool)>;
    using type_signal_volume = sigc::signal<void(double)>;
    using type_signal_watch_stream = sigc::signal<void()>;
    type_signal_mute_cs signal_mute_cs();
    type_signal_volume signal_volume();
    type_signal_watch_stream signal_watch_stream();

private:
    type_signal_mute_cs m_signal_mute_cs;
    type_signal_volume m_signal_volume;
    type_signal_watch_stream m_signal_watch_stream;
};
