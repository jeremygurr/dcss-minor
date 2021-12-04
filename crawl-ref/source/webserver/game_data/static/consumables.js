define(["jquery", "comm", "./cell_renderer", "./enums", "./options", "./player",
        "./tileinfo-icons", "./tileinfo-gui", "./util"],
function ($, comm, cr, enums, options, player, icons, gui, util) {
    "use strict";

    var filtered_inv;
    var renderer, $canvas, $settings, $tooltip;
    var borders_width;
    var minimized;
    var settings_visible;
    var tooltip_timeout = null;
    // Options
    var scale, orientation, font_family, font_size;
    var font; // cached font name for the canvas: size (in px) + family
    var selected = -1;

    function send_options()
    {
        options.set("consumables_panel_orientation", orientation, false);
        options.set("consumables_panel_show", !minimized, false);
        options.send("consumables_panel_orientation");
        options.send("consumables_panel_show");
    }

    function hide_consumables(send_opts=true)
    {
        $("#consumables-settings").hide();
        $("#consumables").addClass("hidden");
        $("#consumables-placeholder").removeClass("hidden").show();
        minimized = true;
        if (send_opts)
            send_options();
    }

    function show_consumables(send_opts=true)
    {
        $("#consumables-settings").hide(); // sanitize
        $("#consumables").removeClass("hidden");
        $("#consumables-placeholder").addClass("hidden");
        minimized = false;
        if (send_opts)
            send_options();
    }

    function show_settings(e)
    {
        if (selected > 0)
            return false;
        // Initialize the form with the current values
        $("#orient-" + orientation).prop("checked", true);

        // Parsing is required, because 1.1 * 100 is 110.00000000000001
        // instead of 110 in JavaScript
        var scale_percent = parseInt(scale * 100, 10);
        $("#scale-val").val(scale_percent);
        if (!$("#scale-val").data("default"))
            $("#scale-val").data("default", scale_percent);

        $("#font-size-val").val(font_size);
        if (!$("#font-size-val").data("default"))
            $("#font-size-val").data("default", font_size);

        // Show the context menu near the cursor
        $settings = $("#consumables-settings");
        $settings.css({top: e.pageY + 10 + "px",
                      left: e.pageX + 10 + "px"});
        $settings.show();
        settings_visible = true;

        return false;
    }

    function hide_settings()
    {
        $("#consumables-settings").hide();
        settings_visible = false;
    }

    function hide_tooltip()
    {
        if (tooltip_timeout)
            clearTimeout(tooltip_timeout);
        $tooltip.hide();
    }

    function show_tooltip(x, y, slot)
    {
        if (slot >= filtered_inv.length)
        {
            hide_tooltip();
            return;
        }
        $tooltip.css({top: y + 10 + "px",
                     left: x + 10 + "px"});
        if (slot == -1)
        {
            $tooltip.html("<span>Left click: minimize</span><br />"
                          + "<span>Right click: open settings</span>");
        }
        else
        {
            var item = filtered_inv[slot];
            $tooltip.empty().text(player.index_to_letter(item.slot) + " - ");
            $tooltip.append(player.inventory_item_desc(item.slot));
            if (game.get_input_mode() == enums.mouse_mode.COMMAND)
            {
                if (item.action_verb)
                    $tooltip.append("<br /><span>Left click: "
                                    + item.action_verb.toLowerCase()
                                    + "</span>");
                $tooltip.append("<br /><span>Right click: describe</span>");
            }
        }
        $tooltip.show();
    }

    // Initial setup for the panel and its settings menu.
    // Note that "game_init" happens before the client receives
    // the options and inventory data from the server.
    $(document).bind("game_init", function () {
        $canvas = $("#consumables");
        $settings = $("#consumables-settings");
        $tooltip = $("#consumables-tooltip");

        renderer = new cr.DungeonCellRenderer();
        borders_width = (parseInt($canvas.css("border-left-width"), 10) || 0) * 2;
        minimized = false;
        settings_visible = false;
        tooltip_timeout = null;
        filtered_inv = [];

        $canvas.on("update", update);

        $canvas.on("mousemove mouseleave mousedown mouseenter", function (ev) {
                handle_mouse(ev);
            });

        $canvas.contextmenu(function() { return false; });

        // We don't need a context menu for the context menu
        $settings.contextmenu(function () {
            return false;
        });

        // Clicking on the panel/Close button closes the settings menu
        $("#consumables, #close-settings").click(function () {
            hide_settings();
        });

        // Triggering this function on keyup might be too agressive,
        // but at least the player doesn't have to press Enter to confirm changes
        $("#consumables-settings input[type=radio],input[type=number]")
            .on("change keyup", function (e) {
                var input = e.target;
                if (input.type === "number" && !input.checkValidity())
                    return;
                options.set(input.name, input.value);
        });

        $("#consumables-settings button.reset").click(function () {
            var input = $(this).siblings("input");
            var default_value = input.data("default");
            input.val(default_value);
            options.set(input.prop("name"), default_value);
        });

        $("#minimize-panel").click(hide_consumables);

        $("#consumables-placeholder").click(function () {
            show_consumables();
            update();
        });

        // To prevent the game from showing an empty panel before
        // any inventory data arrives, we hide it via inline CSS
        // and the "hidden" class. The next line deactivates
        // the inline rule, and the first call to update() will
        // remove "hidden" if the (filtered) inventory is not empty.
        $canvas.show();
    });

    function _horizontal()
    {
        return orientation === "horizontal" ? true : false;
    }

    function _update_font_props()
    {
        font = (font_size || "16") + "px " + (font_family || "monospace");
    }

    function handle_mouse(ev)
    {
        if (ev.type === "mouseleave")
        {
            selected = -1;
            hide_tooltip();
            update();
        }
        else
        {
            var cell_width = renderer.cell_width * scale;
            var cell_height = renderer.cell_height * scale;
            var cell_length = _horizontal() ? cell_width : cell_height;

            // XX this code is copied from dungeon renderer, needs tested on a
            // hidpi device
            var ratio = window.devicePixelRatio;
            var loc = {
                x: Math.round(ev.clientX / (cell_width / ratio) - 0.5),
                y: Math.round(ev.clientY / (cell_height / ratio) - 0.5)
            };

            if (ev.type === "mousemove" || ev.type === "mouseenter")
            {
                var oldselected = selected;
                selected = _horizontal() ? loc.x : loc.y;
                update();
                if (oldselected != selected)
                {
                    hide_tooltip();
                    tooltip_timeout = setTimeout(function()
                    {
                        show_tooltip(ev.pageX, ev.pageY, selected - 1);
                    }, 500);
                }
            }
            else if (ev.type === "mousedown" && ev.which == 1)
            {
                if (selected == 0)
                    hide_consumables();
                else if (game.get_input_mode() == enums.mouse_mode.COMMAND
                    && selected > 0 && selected < filtered_inv.length + 1)
                {
                    comm.send_message("inv_item_action",
                                      {slot: filtered_inv[selected - 1].slot});
                }
            }
            else if (ev.type === "mousedown" && ev.which == 3)
            {
                // right click anywhere hides settings
                if (settings_visible)
                    hide_settings();
                else if (selected == 0) // right click on the x shows settings
                    show_settings(ev);
                else if (game.get_input_mode() == enums.mouse_mode.COMMAND
                    && selected > 0 && selected < filtered_inv.length + 1)
                {
                    comm.send_message("inv_item_describe",
                                      {slot: filtered_inv[selected - 1].slot});
                }
            }
        }
    }

    function update()
    {
        if (minimized)
        {
            hide_consumables(false);
            return;
        }

        // Filter
        filtered_inv = Object.values(player.inv).filter(function (item) {
            if (!item.quantity) // Skip empty inventory slots
                return false
            else if (item.hasOwnProperty("qty_field") && item.qty_field)
                return true;
        });

        if (!filtered_inv.length)
        {
            $canvas.addClass("hidden");
            return;
        }

        // Sort
        filtered_inv.sort(function (a, b) {
            if (a.base_type === b.base_type)
                return a.sub_type - b.sub_type;

            return a.base_type - b.base_type;
        });

        // Render
        var cell_width = renderer.cell_width * scale;
        var cell_height = renderer.cell_height * scale;
        var cell_length = _horizontal() ? cell_width
                                        : cell_height;
        var required_length = cell_length * (filtered_inv.length + 1);
        var available_length = _horizontal() ? $("#dungeon").width()
                                             : $("#dungeon").height();
        available_length -= borders_width;
        var max_cells = Math.floor(available_length / cell_length);
        var panel_length = Math.min(required_length, available_length);

        util.init_canvas($canvas[0],
                         _horizontal() ? panel_length : cell_width,
                         _horizontal() ? cell_height : panel_length);
        renderer.init($canvas[0]);

        renderer.ctx.fillStyle = "black";
        renderer.ctx.fillRect(0, 0,
                              _horizontal() ? panel_length : cell_width,
                              _horizontal() ? cell_height : panel_length);

        // XX This should definitely be a different/custom icon
        renderer.draw_gui(gui.PROMPT_NO, 0, 0, scale);
        if (selected == 0)
            renderer.draw_icon(icons.CURSOR3, 0, 0, undefined, undefined, scale);

        filtered_inv.slice(0, max_cells).forEach(function (item, idx) {
            var offset = cell_length * (idx + 1);
            item.tile.forEach(function (tile) { // Draw item and brand tiles
                renderer.draw_main(tile,
                                   _horizontal() ? offset : 0,
                                   _horizontal() ? 0 : offset,
                                   scale);
                if (selected == idx + 1)
                {
                    renderer.draw_icon(icons.CURSOR3,
                                       _horizontal() ? offset : 0,
                                       _horizontal() ? 0 : offset,
                                       undefined, undefined,
                                       scale);
                }
            });

            var qty_field_name = item.qty_field;
            if (item.hasOwnProperty(qty_field_name))
            {
                renderer.draw_quantity(item[qty_field_name],
                                       _horizontal() ? offset : 0,
                                       _horizontal() ? 0 : offset,
                                       font);
            }
        });

        if (available_length < required_length)
        {
            var ellipsis = icons.ELLIPSIS;
            var x_pos = 0, y_pos = 0;

            if (_horizontal())
                x_pos = available_length - icons.get_tile_info(ellipsis).w * scale;
            else
                y_pos = available_length - icons.get_tile_info(ellipsis).h * scale;

            renderer.draw_icon(ellipsis, x_pos, y_pos, -2, -2, scale);
        }
        $canvas.removeClass("hidden");
    }

    options.add_listener(function () {
        // synchronize visible state with new options. Because of messy timing
        // issues with the crawl binary, this will run at least twice on
        // startup.
        var update_required = false;

        var new_scale = options.get("consumables_panel_scale") / 100;
        if (scale !== new_scale)
        {
            scale = new_scale;
            update_required = true;
        }

        // is one of: horizontal, vertical
        var new_orientation = options.get("consumables_panel_orientation");
        var new_min = !options.get("consumables_panel_show");
        if (orientation !== new_orientation)
        {
            orientation = new_orientation;
            update_required = true;
        }
        if (new_min != minimized)
        {
            minimized = new_min;
            update_required = true;
        }

        var new_font_family = options.get("consumables_panel_font_family");
        if (font_family !== new_font_family)
        {
            font_family = new_font_family;
            _update_font_props();
            update_required = true;
        }

        var new_font_size = options.get("consumables_panel_font_size");
        if (font_size !== new_font_size)
        {
            font_size = new_font_size;
            _update_font_props();
            update_required = true;
        }

        if (update_required)
        {
            if (!minimized)
                show_consumables(false);
            update();
        }
    });
});