/**
 * @file
 * @brief Declarations for the god menu.
 */

#include "menu.h"

class GodMenuEntry : public MenuEntry
{
public:
    GodMenuEntry(god_type god, bool long_name = false);

    virtual std::string get_text(const bool unused = false) const;

public:
    god_type god;

private:
    std::string colour_text;
};