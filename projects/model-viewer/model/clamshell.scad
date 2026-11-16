/*
 * Fully Configurable Clamshell Box
 *
 * This is a remix of the clamshell box that allows you to configure the interior and the outer dimensions
 *
 * Copyright (C) 2024 Melonee Wise, https://meloneewise.com/
 *
 * MakerWorld Handle: https://makerworld.com/en/@chateauhouseyho
 * Link: 
 *
 * Remix of: Clamshell Parts Box (https://makerworld.com/en/models/786443-clamshell-parts-box#profileId-1277533)  
 
 * Shout out to julian.norway for helping to update the height parameters fo the model and save me sometime, you rock!
 *
 */

// BOSL2 is no longer needed at render time: the handful of BOSL2 calls this model
// used are implemented natively below (verified identical), which cuts every render
// by the ~100 ms it takes OpenSCAD to parse BOSL2.
// Plain-OpenSCAD equivalents of the few BOSL2 calls the model uses.
// BOSL2 "orient": rotate the part's +Z axis onto the given direction.
function _orient_rot(dir) =
    dir == "right" ? [0, 90, 0] :
    dir == "left"  ? [0, -90, 0] :
    dir == "back"  ? [-90, 0, 0] : [0, 0, 0];

// _prismoid(size1, size2, h, shift): bottom rectangle centred at the origin,
// top rectangle centred at `shift`, `h` above.
module _prismoid(size1, size2, h, shift = [0, 0], orient = "up") {
    x1 = size1[0] / 2; y1 = size1[1] / 2;
    x2 = size2[0] / 2; y2 = size2[1] / 2;
    sx = shift[0]; sy = shift[1];
    rotate(_orient_rot(orient))
        polyhedron(
            points = [
                [-x1, -y1, 0], [ x1, -y1, 0], [ x1,  y1, 0], [-x1,  y1, 0],
                [sx - x2, sy - y2, h], [sx + x2, sy - y2, h], [sx + x2, sy + y2, h], [sx - x2, sy + y2, h]
            ],
            faces = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]);
}

// cylinder(h, r1, r2, orient=RIGHT|LEFT) with BOSL2's default bottom anchor.
module _cyl(h, r1, r2, orient) {
    rotate(_orient_rot(orient)) cylinder(h = h, r1 = r1, r2 = r2);
}

// chamfer_edge_mask(l, chamfer, orient=RIGHT): a square prism turned 45 degrees.
module _chamfer_edge_mask(l, chamfer, orient = "up") {
    rotate(_orient_rot(orient)) cylinder(r = chamfer, h = l + 0.1, center = true, $fn = 4);
}

// right_triangle(size, spin): right angle at the origin.
module _right_triangle(size, spin = 0) {
    rotate(spin) polygon([[size[0], 0], [0, 0], [0, size[1]]]);
}

/* [Box Size] */
// Outer width, side to side (mm)
width = 80;          // [35:220]
// Outer depth, hinge to front (mm)
depth = 80;          // [35:110]
// Closed height (mm)
height = 25;         // [17:110]

/* [Label] */
// The label pocket is always centred on the box height
label_width = 40.5;  // [0:90]
label_height = 14.25; // [0:50]

/* [Hidden] */
// Legacy fixed sizes from the original model; "custom" uses the sliders above.
// The web viewer offers these as presets instead.
config = "custom";   // ["standard", "extra tall", "extra wide", "extra wide extra tall", "custom"]

function config_dims(key) =
    key == "standard"              ? [80 , 80, 25, 40.5, 14.25] :
    key == "extra tall"            ? [80 , 80, 40, 40.5, 14.25] :
    key == "extra wide"            ? [120, 80, 25, 40.5, 14.25] :
    key == "extra wide extra tall" ? [120, 80, 40, 40.5, 14.25] :
    [width, depth, height, label_width, label_height];

dims        = config_dims(config);
box_w       = dims[0];
box_d       = dims[1];
box_h       = dims[2];
label_w     = dims[3];
label_h     = dims[4];
label_h_loc = box_h / 2;

/* [Features] */
// Add the feet on the back
footy = true;

/* [Snaps] */
// How the lid snaps shut; "custom" uses the snap_* values under Advanced
snap_fit = "normal";    // ["loose", "normal", "wide loose", "wide normal", "custom"]
// Snap on the front, opposite the hinge
front_snap = true;
// Extra snaps on the left and right sides
side_snaps = false;

/* [Hidden] */
// Custom snap fit (snap_fit = "custom"). Front snap: bump on the lid, catch in the base.
// Front snap width, side to side (mm)
snap_width = 10;        // [4:0.5:40]
// How far the front bump sticks out; more = firmer snap (mm)
snap_depth = 0.8;       // [0.2:0.05:1.6]
// How deep the front catch is; shallower than the bump = tighter hold (mm)
snap_catch_depth = 0.7; // [0.2:0.05:1.6]
// Front bump height at its root; the catch is 0.2 mm shorter (mm)
snap_height = 2.2;      // [1:0.1:4]
// Side snaps: a ridge on the base's lip clicks into a groove inside the lid.
// Side snap length, front to back (mm)
side_snap_length = 10;       // [4:0.5:60]
// How far the side ridge sticks out past the 0.2 mm lid gap; more = firmer (mm)
side_snap_depth = 0.4;       // [0.1:0.05:0.7]
// How deep the groove in the lid is (the lid wall there is 0.9 mm) (mm)
side_snap_catch_depth = 0.35; // [0.1:0.05:0.6]

// Resolved snap sizes: [front width, front depth, front catch, front height,
//                       side length, side depth, side catch]
function snap_fit_dims(key) =
    key == "loose"       ? [10, 0.6, 0.7, 2.2, 10, 0.25, 0.35] :
    key == "normal"      ? [10, 0.8, 0.7, 2.2, 10, 0.4,  0.35] :
    key == "wide loose"  ? [20, 0.6, 0.7, 2.2, 20, 0.25, 0.35] :
    key == "wide normal" ? [20, 0.8, 0.7, 2.2, 20, 0.4,  0.35] :
    [snap_width, snap_depth, snap_catch_depth, snap_height,
     side_snap_length, side_snap_depth, side_snap_catch_depth];

/* [Easy Open] Experimental: ways to make the lid easier to open */
// How the lid locks. "squeeze latches" swaps the front and side snaps for a press-to-release latch in a 2 mm housing on each side (the box gets 4 mm wider): squeeze the ribbed spots, then lift
lid_lock = "snaps";     // ["snaps", "squeeze latches"]
// Cut the front snap's catch free into two springs so it opens with much less force
front_flex = false;
// A thumb ledge on the lid's front edge to push the lid up with
lift_tab = false;

/* [Hidden] */
// Squeeze latch spring length, front to back; longer = lighter squeeze (mm)
latch_length = 20;      // [12:0.5:60]
// How far the latch hook reaches into the lid's rim; more = firmer hold (mm)
latch_engage = 0.6;     // [0.3:0.05:0.8]
// Front flex spring span, side to side; longer = lighter snap (mm)
front_flex_length = 32; // [20:1:200]
// Lift tab width (mm)
lift_tab_width = 20;    // [8:0.5:40]
// How far the lift tab sticks out past the front (mm)
lift_tab_reach = 4;     // [2:0.5:8]

/* [Dividers] */
bottom_chamfer = false;
chamfer_size   = 2;
// Repeat the base's compartment layout inside the lid
lid_dividers = true;

/* [Compartment Layout]
   Edited visually in the web viewer's layout editor.
   col_splits / row_splits are divider line positions as fractions (0..1) of the
   interior width / depth. cells holds a compartment id per grid cell, row by row
   starting at the hinge side; neighbouring cells with different ids get a wall
   between them, equal ids merge into one compartment. */
col_splits = [0.3333, 0.6667];
row_splits = [0.3333, 0.6667];
cells = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/* [Shadowbox Inserts]
   Edited in the web viewer. A fill turns a compartment into a solid block; tools
   are meshes pressed into fills as negative pockets. */
// [fx, fy, height]: fill the compartment containing (fx, fy) — fractions of the
// interior, like col_splits — solid to `height` mm above the floor.
fills = [];
// [file, x, y, rz, rx, ry, depth, clearance, style, ox, oy, oz]
//   file       mesh to press in (STL or 3MF, relative to this file)
//   x, y       where the tool's footprint centre goes, mm from the interior's
//              left / hinge-side corner
//   rx, ry     how the tool is laid down (applied first), then rz turns it
//   depth      how far below the top of the fill the tool's lowest point sits
//   clearance  extra gap around the tool, mm
//   style      "silhouette": straight-walled pocket of the outline, so the tool
//              lifts straight out; "exact": form-fitting imprint
//   ox, oy, oz offset that centres the laid-down tool's footprint on the origin
//              with its lowest point at z = 0 (the viewer computes this)
tools = [];

/* [Hidden] Resolve the layout */
_C = len(col_splits) + 1;
_R = len(row_splits) + 1;
_xs = concat([0], [for (f = col_splits) min(max(f, 0), 1)], [1]);
_ys = concat([0], [for (f = row_splits) min(max(f, 0), 1)], [1]);
// Fall back to one compartment per cell if the id list does not match the grid
_cells = len(cells) == _R * _C ? cells : [for (k = [0:_R * _C - 1]) k];
// Closing the lid flips it over the hinge, so its layout is mirrored front-to-back
_lid_ys    = [for (k = [len(_ys) - 1:-1:0]) 1 - _ys[k]];
_lid_cells = [for (r = [_R - 1:-1:0], c = [0:_C - 1]) _cells[r * _C + c]];

/* [Hidden] */
$fn = 32;
divider_color = "#5B6578";

// Web viewer: build one piece at a time. The viewer renders the parts in parallel
// and caches each one, re-using a part when only settings it ignores changed.
// "all" is the normal printable assembly.
mv_part = "all"; // ["all", "base", "lid", "dividers", "inserts"]
function _mv_build(part) = mv_part == "all" || mv_part == part;
// Settings each part does not depend on (keep these conservative: a missing
// entry only costs a re-render, a wrong one would show a stale part).
mv_ignore_base     = ["col_splits", "row_splits", "cells", "lid_dividers", "bottom_chamfer", "chamfer_size", "divider_color", "fills", "tools", "insert_color", "snap_depth", "side_snap_catch_depth", "lift_tab_width", "lift_tab_reach"];
mv_ignore_lid      = ["col_splits", "row_splits", "cells", "lid_dividers", "bottom_chamfer", "chamfer_size", "divider_color", "fills", "tools", "insert_color", "label_width", "label_height", "snap_catch_depth", "side_snap_depth", "front_flex", "front_flex_length", "latch_engage"];
mv_ignore_dividers = ["footy", "label_width", "label_height", "hinge_clear", "hinge_dia", "hinge_comp_len", "fills", "tools", "insert_color", "snap_fit", "front_snap", "side_snaps", "snap_width", "snap_depth", "snap_catch_depth", "snap_height", "side_snap_length", "side_snap_depth", "side_snap_catch_depth", "lid_lock", "front_flex", "lift_tab", "latch_length", "latch_engage", "front_flex_length", "lift_tab_width", "lift_tab_reach"];
mv_ignore_inserts  = ["footy", "label_width", "label_height", "hinge_clear", "hinge_dia", "hinge_comp_len", "lid_dividers", "bottom_chamfer", "chamfer_size", "divider_color", "snap_fit", "front_snap", "side_snaps", "snap_width", "snap_depth", "snap_catch_depth", "snap_height", "side_snap_length", "side_snap_depth", "side_snap_catch_depth", "lid_lock", "front_flex", "lift_tab", "latch_length", "latch_engage", "front_flex_length", "lift_tab_width", "lift_tab_reach"];

insert_color = "#8A96A8";

// --- Base dims
base_h         = box_h - 2.1;
base_lip_top_h = base_h - 3;
base_lip_bot_h = base_lip_top_h - 3;

base_w         = box_w;
base_d         = box_d;
base_outer_d   = base_d - 2.5;
base_t         = 2;

// --- Lid dims
lid_d          = base_d;
lid_w          = base_w;
lid_h          = 7.9;
lid_side_t     = 2;
lid_fb_t       = 3;
lid_outer_d    = lid_d - 2.5;

lid_lip_top_h  = lid_h;
lid_lip_bot_h  = lid_lip_top_h - 1;

// --- Hinge params
hinge_clear     = 0.25;
hinge_dia       = 3;
hinge_axis_len  = base_w - 2*9.5;
hinge_comp_len  = 3;

// --- Snap params
_snap           = snap_fit_dims(snap_fit);
// Keep the front snap inside the bump-out it clips over
_snap_w         = min(_snap[0], box_w - 32);
_snap_depth     = _snap[1];
_snap_catch     = _snap[2];
_snap_h         = _snap[3];
// Side snaps sit mid-side, clear of the corner chamfers
_side_snap_l    = min(_snap[4], box_d - 30);
_side_snap_d    = _snap[5];
_side_snap_c    = _snap[6];
_side_snap_zh   = 1.6;               // ridge height at its root
_side_snap_z    = box_h - 6.5;       // ridge centre in the base; groove centre in the lid is at z = 6.5

// --- Easy-open params
// Closed, a lid point at height z sits at box_h - z in the base's frame, at the same y.
// Both springs are strips cut free by a slot underneath. Neither takes room from
// the compartments or opens into them: the squeeze latches live in a housing on
// the outside of the side walls, and the front springs sit above the compartments'
// top edge.
_latch_l        = min(latch_length, box_d - 20);  // must stay on the flat of the side
_latch_ok       = _latch_l >= 12;                 // any shorter is too stiff to squeeze
_latches        = lid_lock == "squeeze latches" && _latch_ok;
// The squeeze latches replace both snaps
_front_snap     = front_snap && !_latches;
_side_snaps     = side_snaps && !_latches;
// Each front spring's length; the roots must stay under the full height of the front tab
_flex_half      = min(front_flex_length/2, box_w/2 - 17);
_flex_ok        = _flex_half >= 10;
_front_flex     = front_flex && _front_snap && _flex_ok;
_slot           = 0.6;               // spring slot width
_latch_y        = 0.5;               // spring centre; the root is at the back, the free end at the front
_latch_y0       = _latch_y - _latch_l/2;
_latch_y1       = _latch_y + _latch_l/2;
_latch_hook_l   = min(10, _latch_l/2);
_latch_zb       = box_h - 6.9;       // underside of the hook
_latch_hh       = 1.6;               // hook height
_latch_out      = 2;                 // how far the housing stands proud of the side
// How far the latch can be pushed in before it bottoms out on the wall: enough to
// let go, no more. It's recessed into the outside of the wall, which keeps the rest.
_latch_gap      = latch_engage + 0.4;
_latch_z        = max(base_lip_bot_h - 7, 2.5);  // bottom of the slot under the latch spring
// Housing ends, front to back, on the base and the lid
_house_y0       = _latch_y0 - 2;
_house_y1       = _latch_y1 + _slot + 2;

// What the web viewer should grey out or warn about, as [param, "off" | "note", why].
// Reported with the base, so everything read here must stay out of mv_ignore_base.
function _custom_snap_hint(used, what) =
    snap_fit != "custom" ? "Only used when snap_fit is custom" :
    !used ? str("The ", what, " is not in use") : "";
_hints = [
    if (lid_lock == "squeeze latches" && !_latch_ok)
        ["lid_lock", "note", "The box is too short front to back for squeeze latches, so it uses the snaps"],
    if (_latches) ["front_snap", "off", "Replaced by the squeeze latches"],
    if (_latches) ["side_snaps", "off", "Replaced by the squeeze latches"],
    if (!_front_snap && !_side_snaps) ["snap_fit", "off", "No snaps are in use"],
    if (!(_front_snap && _flex_ok))
        ["front_flex", "off",
         _latches     ? "Squeeze latches replace the front snap" :
         !front_snap  ? "Needs the front snap" :
                        "The box is too narrow for the front springs"],
    if (!_latches) ["latch_length", "off", "Only used by squeeze latches"],
    if (!_latches) ["latch_engage", "off", "Only used by squeeze latches"],
    if (!_front_flex) ["front_flex_length", "off", "Only used by front flex"],
    if (!lift_tab) ["lift_tab_width", "off", "Only used by the lift tab"],
    if (!lift_tab) ["lift_tab_reach", "off", "Only used by the lift tab"],
    for (n = ["snap_width", "snap_depth", "snap_catch_depth", "snap_height"])
        let (why = _custom_snap_hint(_front_snap, "front snap")) if (why != "") [n, "off", why],
    for (n = ["side_snap_length", "side_snap_depth", "side_snap_catch_depth"])
        let (why = _custom_snap_hint(_side_snaps, "side snap")) if (why != "") [n, "off", why],
];
if (_mv_build("base")) echo(str("MV_HINTS=", _hints));

// --- Divider params
div_t           = 1;
shell_bottom_t  = 1.6;
shell_wall_t    = 2;

// --- Internals
ext_w           = 70;
ext_l           = 136;

box_internal_h  = base_h - 4.7;
box_internal_w  = box_w - 4;
box_internal_d  = box_d - 7.5;

lid_internal_h  = 3.30;
lid_internal_d  = box_d - 8.5;

// ----------------------
// Helpers 
// ----------------------
module _grip_pair_on_side(sx, l, y, z_base, gap, w_bot=1.5, h_bot=10, w_top=0.5, h_top=9, depth=0.5) {
    for (k = [0:1]) {
        z = z_base + (w_bot/2) + k*(w_bot + gap);
        translate([sx*l/2, y, z])
            _prismoid([w_bot, h_bot], [w_top, h_top], depth, orient=(sx == 1 ? "right" : "left"));
    }
}

// Clearance pocket for a foot: the foot grown by 0.2 mm on every axis.
// Precomputed from minkowski() { zrot(180) _bosl2_footy(); cube(.4, center=true); } (see clamshell.bosl2-reference.scad)
module _footy_pocket_at(x,y,z) {
    translate([x,y,z]) _footy_pocket_mesh();
}

// Corner-chamfered box with a 2 mm chamfer round the bottom. The shape is convex,
// so it is built as a hull instead of BOSL2 edge masks (identical geometry,
// ~150 ms less script evaluation per call). Reference version: clamshell.bosl2-reference.scad.
module _chamfered_outline(l, w, fc, bc) {
    polygon([
        [-l/2 + bc, -w/2], [ l/2 - bc, -w/2], [ l/2, -w/2 + bc], [ l/2,  w/2 - fc],
        [ l/2 - fc,  w/2], [-l/2 + fc,  w/2], [-l/2,  w/2 - fc], [-l/2, -w/2 + bc]
    ]);
}

module generate_edge_chamfered_cuboid(l, w, h, fc, bc) {
    hull() {
        translate([0, 0, 2]) linear_extrude(h - 2) _chamfered_outline(l, w, fc, bc);
        linear_extrude(0.001) offset(delta = -2) _chamfered_outline(l, w, fc, bc);
    }
}


// ----------------------
// Assembly view
// ----------------------
mw_assembly_view();
module mw_assembly_view() {
    if (_mv_build("base"))
    color("#FFFFFF")
    translate([0, base_outer_d/2+0.5, 0])
        generate_base(base_w, base_outer_d, base_h, base_t);

    if (_mv_build("lid"))
    color("#FFFFFF")
    translate([0, -lid_outer_d/2-0.5, 0]) rotate([0,0,180])
        generate_lid(lid_w, lid_outer_d, lid_h, lid_side_t, lid_fb_t);

    if (_mv_build("dividers")) {
        // --- compartment dividers (base)
        color(divider_color)
        translate([-base_w/2+base_t, base_t+1.5, shell_bottom_t-.1])
            generate_layout_dividers(box_internal_w, box_internal_d, box_internal_h + 0.2,
                                     _xs, _ys, _cells, bottom_chamfer, chamfer_size);

        // --- compartment dividers (lid)
        if (lid_dividers)
        color(divider_color)
        translate([-lid_w/2+lid_side_t, -lid_outer_d+2.5, shell_bottom_t-.1])
            generate_layout_dividers(box_internal_w, lid_internal_d, lid_internal_h + 0.1,
                                     _xs, _lid_ys, _lid_cells, false, chamfer_size);
    }

    // --- shadowbox fills with tool pockets (base only)
    if (_mv_build("inserts") && len(fills) > 0)
    color(insert_color)
    translate(_base_grid_origin)
        generate_inserts();
}

// Where the divider grids sit, for the web viewer's in-3D layout editor:
// interior w,d,h | base origin x,y,z | lid depth,height | lid origin x,y,z | wall thickness | colours
echo(str("MV_LAYOUT=",
    box_internal_w, ",", box_internal_d, ",", box_internal_h + 0.2, ",",
    -base_w/2 + base_t, ",", base_t + 1.5, ",", shell_bottom_t - .1, ",",
    lid_internal_d, ",", lid_internal_h + 0.1, ",",
    -lid_w/2 + lid_side_t, ",", -lid_outer_d + 2.5, ",", shell_bottom_t - .1, ",",
    div_t, ",", divider_color, ",", insert_color));

// The web viewer's STEP export rebuilds this model with exact curves in
// OpenCascade (src/step/clamshell.ts). It asks for these resolved sizes with
// mv_part = "dims" rather than recomputing them, so the two can't disagree on
// numbers; the construction itself is mirrored there module by module.
if (mv_part == "dims") echo(str("MV_DIMS=", [
    ["box_w", box_w], ["box_d", box_d], ["box_h", box_h],
    ["label_w", label_w], ["label_h", label_h], ["label_h_loc", label_h_loc], ["footy", footy],
    ["base_w", base_w], ["base_d", base_d], ["base_h", base_h], ["base_outer_d", base_outer_d], ["base_t", base_t],
    ["base_lip_top_h", base_lip_top_h], ["base_lip_bot_h", base_lip_bot_h],
    ["lid_w", lid_w], ["lid_h", lid_h], ["lid_outer_d", lid_outer_d], ["lid_side_t", lid_side_t], ["lid_fb_t", lid_fb_t],
    ["lid_lip_bot_h", lid_lip_bot_h], ["lid_lip_top_h", lid_lip_top_h],
    ["hinge_clear", hinge_clear], ["hinge_dia", hinge_dia], ["hinge_axis_len", hinge_axis_len], ["hinge_comp_len", hinge_comp_len],
    ["front_snap", _front_snap], ["side_snaps", _side_snaps],
    ["snap_w", _snap_w], ["snap_depth", _snap_depth], ["snap_catch", _snap_catch], ["snap_h", _snap_h],
    ["side_snap_l", _side_snap_l], ["side_snap_d", _side_snap_d], ["side_snap_c", _side_snap_c],
    ["side_snap_zh", _side_snap_zh], ["side_snap_z", _side_snap_z],
    ["grips", _grips_clear(base_outer_d/2 - 16)],
    ["latches", _latches], ["latch_engage", latch_engage], ["slot", _slot],
    ["latch_y0", _latch_y0], ["latch_y1", _latch_y1], ["latch_hook_l", _latch_hook_l],
    ["latch_zb", _latch_zb], ["latch_hh", _latch_hh], ["latch_out", _latch_out], ["latch_gap", _latch_gap],
    ["latch_z", _latch_z], ["house_y0", _house_y0], ["house_y1", _house_y1],
    ["front_flex", _front_flex], ["flex_half", _flex_half],
    ["lift_tab", lift_tab], ["lift_tab_width", lift_tab_width], ["lift_tab_reach", lift_tab_reach],
    ["div_t", div_t], ["shell_bottom_t", shell_bottom_t],
    ["box_internal_w", box_internal_w], ["box_internal_d", box_internal_d], ["box_internal_h", box_internal_h],
    ["lid_internal_d", lid_internal_d], ["lid_internal_h", lid_internal_h],
    ["xs", _xs], ["ys", _ys], ["cells", _cells], ["lid_ys", _lid_ys], ["lid_cells", _lid_cells],
    ["lid_dividers", lid_dividers], ["bottom_chamfer", bottom_chamfer], ["chamfer_size", chamfer_size],
    ["divider_color", divider_color], ["insert_color", insert_color],
    ["fills", fills], ["tools", len(tools)],
]));


// ----------------------
// Base & Lid top-level
// ----------------------
module generate_base(base_w, base_d, base_h, base_t) {
    difference() {
        union() {
            generate_base_shell(base_w, base_d, base_h, base_lip_top_h, base_lip_bot_h, base_t);
            if (_latches) _both_sides() _latch_housing();
        }

        // interior latch
        if (_front_snap)
        translate([0, base_d/2-base_t, box_h-3.5])
            _prismoid([_snap_w, _snap_h-0.2], [_snap_w, 0.6], _snap_catch, orient="back");

        // label pocket
        translate([0, base_d/2-1/2, label_h_loc])
            _prismoid([label_w,label_h], [label_w,label_h+1], 1, shift=[0,-.5], orient="back");
        if(footy){
        // footy pockets (offset minkowski)
        _footy_pocket_at(-base_w/2+5.8284+5, -base_d/2-0.8, 0);
        _footy_pocket_at( base_w/2-5.8284-5, -base_d/2-0.8, 0);
        }
        // hinge clearance cuts
        translate([-base_w/2, -base_d/2-.5, box_h/2-.1])
            generate_hinge_components(true, true);

        if (_latches) _both_sides() _latch_cuts();
        if (_front_flex) _flex_cuts(base_d);
    }

    // hinge components
    translate([-base_w/2, -base_d/2-.5, box_h/2])
        generate_hinge_components(true, false);

    if (_latches) _both_sides() { _latch_hook(); _latch_ribs(); }

    // side snap ridges on the outside of the lip
    if (_side_snaps)
    for (sx = [-1, 1])
        translate([sx*(base_w/2 - 1.2), 0.5, _side_snap_z])
            _prismoid([_side_snap_zh, _side_snap_l], [0.6, _side_snap_l - 1], 0.3 + _side_snap_d,
                      orient=(sx == 1 ? "right" : "left"));
}

module generate_lid(lid_w, lid_outer_d, lid_h, lid_side_t, lid_fb_t) {
    difference() {
        union() {
            generate_lid_shell(lid_w, lid_outer_d, lid_h, lid_lip_bot_h, lid_lip_top_h, lid_side_t, lid_fb_t);
            if (_latches) _both_sides() _latch_lid_housing();
        }

        if(footy){
        // footy pockets (offset minkowski)
        _footy_pocket_at(-lid_w/2+16.82843+5, -lid_outer_d/2-0.8, 0);
        _footy_pocket_at( lid_w/2-16.82843-5, -lid_outer_d/2-0.8, 0);
        }
        
        // hinge clearance cuts
        translate([-base_w/2, -base_d/2+.75, box_h/2-.1])
            generate_hinge_components(false, true);

        // latch interface cutout
        translate([0, lid_outer_d/2 - lid_fb_t/2 - 0.34999 + 1.25, lid_h-6])
            _prismoid([box_w-30.06, lid_fb_t], [box_w-18.06, lid_fb_t], 6);

        // side snap grooves inside the rim (the lid flips over the hinge, so they
        // line up with the base's ridges at the same y)
        if (_side_snaps)
        for (sx = [-1, 1])
            translate([sx*(lid_w/2 - 1), 0.5, 6.5])
                _prismoid([_side_snap_zh + 0.2, _side_snap_l + 1], [0.8, _side_snap_l], 0.1 + _side_snap_c,
                          orient=(sx == 1 ? "right" : "left"));

        // windows in the rim for the squeeze latches' hooks
        if (_latches) _both_sides() _latch_lid_cuts();
    }


    // hinge components
    translate([-base_w/2, -base_d/2+.75, box_h/2])
        generate_hinge_components(false, false);

    if (lift_tab) _lift_tab(lid_outer_d);

    // external latch
    if (_front_snap)
    difference() {
        translate([0, lid_outer_d/2-2.1, 3.5])
            _prismoid([_snap_w+0.4, _snap_h], [_snap_w-1.2, 0.6], _snap_depth, orient="back");
        for (sx = [-1, 1])
            translate([sx*(_snap_w/2+0.5), lid_outer_d/2-2.1+.5, 3.5-(_snap_h+0.1)/2])
                translate([-0.5,-0.5,0]) cube([1,1,_snap_h+0.1]);
    }
}

// ----------------------
// Base shell
// ----------------------
module generate_base_shell(l,w,h,inner_h,outer_h,t) {
    difference() {
        union() {
            difference() {
                union() {
                    // outer (shorter) + inner (taller) shells
                    generate_edge_chamfered_cuboid(l, w, outer_h, 6, 6);
                    translate([0, 1/2, 0])
                        generate_edge_chamfered_cuboid(l - t - 0.2, w - t - 0.2 - 1, inner_h, 5.3556, 4.3556);
                }
                // inner cavity
                translate([0, 1/2, 1.6])
                    generate_edge_chamfered_cuboid(l - 2*t, w - 2*t - 1, inner_h, 4.8284, 3.8284);
            }

            // front bump-out
            translate([0, w/2 - t/2, outer_h])
                _prismoid([box_w-18.1, t], [box_w-30.1, t], 6);
        }

        // hinge slot (rear)
        translate([0, -w/2+2.1/2, outer_h-(box_h/2-8)])
            _prismoid([base_w-19, 2.1], [base_w-10, 2.1], (box_h/2-8));
    }

    // grips (two per side) — base uses 0.95 gap
    y_grip = w/2 - 16;
    if (_grips_clear(y_grip)) {
        _grip_pair_on_side(+1, l, y_grip, 2.95, 0.95);
        _grip_pair_on_side(-1, l, y_grip, 2.95, 0.95);
    }

    if(footy){
    // back feet (base uses 16.82843 offset)
    translate([ base_w/2 - 16.82843 - 5, -w/2, 0]) generate_footy();
    translate([-base_w/2 + 16.82843 + 5, -w/2, 0]) generate_footy();
    }
}

// ----------------------
// Lid shell
// ----------------------
module generate_lid_shell(l,w,h,inner_h,outer_h,side_t, fb_t) {
    outer_cham      = 6;
    upper_inner_ch0 = 5.47279;
    upper_inner_ch1 = upper_inner_ch0 - 1;
    lower_inner_ch  = 3.82843;
    y_trim = 0.5; z_trim = 1.6;
    shrink_x_upper = 1.8; shrink_y_upper = 2.8;
    tri_size  = [6,6]; tri_thick = 0.5; tri_inset = 1.27279;

    difference() {
        union() {
            difference() {
                // outer shell + upper inner trim
                generate_edge_chamfered_cuboid(l, w, h, outer_cham, outer_cham);
                translate([0, y_trim, z_trim])
                    generate_edge_chamfered_cuboid(l - shrink_x_upper, w - shrink_y_upper, h,
                                                   upper_inner_ch0, upper_inner_ch1);

                // corner trim wedge cutout
                difference() {
                    translate([0, w/2 - 1.25 + 0.35, h])
                        _chamfer_edge_mask(l - 12, 0.5, "right");

                    translate([ l/2 - tri_inset,  w/2, h - tri_thick])
                        linear_extrude(tri_thick) _right_triangle(tri_size, 180);
                    translate([-l/2 + tri_inset,  w/2, h - tri_thick])
                        linear_extrude(tri_thick) _right_triangle(tri_size, 270);
                }
            }

            // lower inner edge
            generate_edge_chamfered_cuboid(l, w, h - 3, outer_cham, outer_cham);
        }

        // main inner cavity
        translate([0, 0, z_trim])
            generate_edge_chamfered_cuboid(l - 2*side_t, w - 2*fb_t, h, lower_inner_ch, lower_inner_ch);
    }

    // hinge bump-out (with edge trims)
    difference() {
        translate([0, -w/2 + 1.9/2, outer_h])
            _prismoid([l-10, 1.9], [l-19, 1.9], h=(box_h/2 - lid_h - 0.1));
        translate([-l/2, -w/2, outer_h - 1]) linear_extrude(5) _right_triangle([6,6]);
        translate([ l/2, -w/2, outer_h - 1]) linear_extrude(5) _right_triangle([6,6], 90);
    }

    // grips (two per side) — lid uses 1.0 gap
    y_grip = w/2 - 16;
    if (_grips_clear(y_grip)) {
        _grip_pair_on_side(+1, l, y_grip, 2.95, 1.0);
        _grip_pair_on_side(-1, l, y_grip, 2.95, 1.0);
    }

    if(footy){
    // back feet (lid uses 5.82843 offset)
    translate([ base_w/2 - 5.82843 - 5, -w/2, 0]) generate_footy();
    translate([-base_w/2 + 5.82843 + 5, -w/2, 0]) generate_footy();
    }
}

// ----------------------
// Easy open (experimental)
// ----------------------
// The latch modules draw the +x side; _both_sides() mirrors them onto -x.
module _both_sides() {
    children();
    mirror([1, 0, 0]) children();
}

// Side grips would run into a latch housing on short boxes, so they give way.
function _grips_clear(y_grip) =
    !_latches || y_grip + 5 < _house_y0 || y_grip - 5 > _house_y1;

// Extrude an (x, z) profile along y, centred on y.
module _along_y(y, len) {
    translate([0, y, 0]) rotate([90, 0, 0]) linear_extrude(len, center = true) children();
}

// Extrude a (y, z) profile along x, centred on x = 0.
module _along_x(len) {
    rotate([90, 0, 90]) linear_extrude(len, center = true) children();
}

// Squeeze latch. A housing on the outside of the side wall carries a leaf spring:
// a strip cut free by a slot underneath and a slot at its free end, so it bends
// sideways along its length rather than from the floor, which keeps the strain on
// its root low. The root is towards the hinge; the free end, with the ribs to press,
// is towards the front. Above the base's rim the spring carries the hook, which
// clicks into a window in a matching housing on the lid. Behind the spring the
// wall is recessed just enough for the hook to let go, and the 1 mm or so of wall
// left behind it keeps the compartment closed. Nothing changes on the inside.
// The rounded root end keeps cracks from starting, and the slot under the spring
// runs at 45° so its underside prints without support.
_latch_s = _slot * sqrt(2);   // a 45° slot's height

module _latch_housing() {
    xo = base_w/2; P = _latch_out;
    // below the rim: the spring plus a fixed foot under it, with a 45° underside
    _along_y((_house_y0 + _house_y1)/2, _house_y1 - _house_y0)
        polygon([[xo - 0.01, _latch_z - 1.5], [xo + P, _latch_z - 1.5 + P],
                 [xo + P, base_lip_bot_h], [xo - 0.01, base_lip_bot_h]]);
    // above the rim: the spring's head, which carries the hook
    _along_y((_latch_y0 + _latch_y1)/2, _latch_y1 - _latch_y0)
        polygon([[xo, base_lip_bot_h - 0.01], [xo + 0.9, base_lip_bot_h - 0.01],
                 [xo + 0.9, base_lip_top_h], [xo, base_lip_top_h]]);
}

module _latch_cuts() {
    xo = base_w/2; z = _latch_z;
    // the recess the spring is pushed into
    translate([xo - _latch_gap, _latch_y0, z]) cube([_latch_gap, _latch_y1 + _slot - _latch_y0, box_h]);
    // under the spring, rising outwards so it only opens up when pressed in
    _along_y((_latch_y0 + _latch_y1 + _slot)/2, _latch_y1 + _slot - _latch_y0)
        polygon([[xo - 0.5, z - 0.5], [xo + 3, z + 3], [xo + 3, z + 3 + _latch_s], [xo - 0.5, z - 0.5 + _latch_s]]);
    // the free end
    translate([xo - _latch_gap, _latch_y1, z - 1]) cube([_latch_gap + 3, _slot, box_h]);
    // rounded root
    translate([xo + 0.75, _latch_y0, z + 0.75 + _latch_s/2]) rotate([0, 45, 0])
        cylinder(d = 2*_slot, h = 4.8, center = true, $fn = 16);
}

// The hook sits on the head's outer face. Only the part of its underside that
// meets the lid's bar is nearly flat (10°, rising to the tip): flat enough to hold
// against a tug, steep enough that a hard pull cams it in rather than snapping the
// bar. The rest, inside the 0.2 mm gap, is 45°, so the ledge printed over air is
// only about 0.6 mm.
module _latch_hook() {
    x0 = base_w/2 + 0.9;
    p  = 0.2 + latch_engage;
    zf = _latch_zb - (p - 0.2) * tan(10);   // where the flat part starts, above the bar's inner edge
    _along_y(_latch_y1 - 1 - _latch_hook_l/2, _latch_hook_l)
        polygon([[x0 - 0.3, zf - 0.5], [x0 + 0.2, zf], [x0 + p, _latch_zb], [x0 + p, _latch_zb + 0.3],
                 [x0 - 0.3, _latch_zb + _latch_hh]]);
}

// Upright ribs on the free end that show where to press.
module _latch_ribs() {
    z0 = _latch_z + _latch_out + _latch_s + 0.4;   // above the slot on the outside
    z1 = base_lip_bot_h - 0.4;
    if (z1 - z0 > 1.5)
        for (k = [0:2])
            translate([base_w/2 + _latch_out, _latch_y1 - 1.5 - 2*k, (z0 + z1)/2])
                _prismoid([z1 - z0, 1], [z1 - z0 - 1, 0.4], 0.5, orient = "right");  // 45° ends
}

// Lid side (lid frame, where a lid point at height z closes onto box_h - z): the
// housing continues up the lid as a skirt 0.2 mm outside the head, on a 45° shelf.
module _latch_lid_housing() {
    xo = lid_w/2; P = _latch_out;
    _along_y((_house_y0 + _house_y1)/2, _house_y1 - _house_y0)
        polygon([[xo - 0.01, lid_h - 3 - P], [xo + P, lid_h - 3],
                 [xo + P, lid_h], [xo + 1.1, lid_h], [xo + 1.1, lid_h - 3],
                 [xo - 0.01, lid_h - 3]]);
}

module _latch_lid_cuts() {
    xo = lid_w/2;
    // the lid's own rim gives way to the head where it is pressed in
    translate([xo - 1, _latch_y0 - 0.5, lid_h - 3])
        cube([1.01, _latch_y1 + _slot + 1 - _latch_y0, 4]);
    // the window for the hook, through the skirt
    l  = _latch_hook_l + 0.6;
    z0 = box_h - _latch_zb - _latch_hh - 0.2;
    z1 = box_h - _latch_zb + 0.25;   // clear of the hook's underside where it meets the bar
    translate([xo + 0.9, _latch_y1 - 1 - _latch_hook_l/2 - l/2, z0]) cube([_latch_out, l, z1 - z0]);
}

// Front flex (base). The front snap's catch sits in the front tab above the
// compartments' top edge, so only that part is cut free: a slot underneath at
// the top edge, and a split in the middle, leave the catch on the free ends of
// two springs rooted out towards the corners. The slot rises inwards (the lid
// only pushes the springs outwards) and opens on the inside just above the top
// edge, so it doesn't open into the compartments.
module _flex_cuts(d) {
    yo = d/2; yi = d/2 - 2;
    z  = base_lip_top_h + 0.45 - 2;  // slot bottom at the outside; 2 mm higher on the inside
    _along_x(2*_flex_half)
        polygon([[yo + 1, z - 1], [yi - 1, z + 3], [yi - 1, z + 3 + _latch_s], [yo + 1, z - 1 + _latch_s]]);
    // the split, only above the slot
    translate([-_slot/2, 0, 0]) rotate([90, 0, 90]) linear_extrude(_slot)
        polygon([[yo + 1, z - 1], [yi - 1, z + 3], [yi - 1, box_h + 1], [yo + 1, box_h + 1]]);
    // rounded roots
    for (sx = [-1, 1])
        translate([sx*_flex_half, yo - 1, z + 1 + _latch_s/2]) rotate([45, 0, 0])
            cylinder(d = 2*_slot, h = 4.2, center = true, $fn = 16);
}

// Lift tab: a flat ledge on the lid's front edge. It prints on the bed and, when
// closed, overhangs the front at the very top for a thumb to push up.
module _lift_tab(d) {
    tw = min(lift_tab_width, box_w - 20);
    translate([0, d/2 - 3, 0]) linear_extrude(1.6)
        offset(r = 1.5) offset(delta = -1.5) translate([-tw/2, 0]) square([tw, 3 + lift_tab_reach]);
}

// ----------------------
// Foot shape
// ----------------------
// The foot is a fixed shape, so it is baked into a polyhedron exported from the
// BOSL2 construction in clamshell.bosl2-reference.scad; rebuilding it every render cost ~100 ms each.
module generate_footy() {
    _footy_mesh();
}

module _footy_mesh() {
    polyhedron(points=[
        [-4,-2.5,0],
        [-4.88763,-1.61237,0.887627],
        [-4,-2.5,1.25529],
        [-3.96839,-2.5,1.3],
        [-5,-1.34108,1],
        [-4,2.5,0],
        [-5,2.5,1],
        [-5,2.5,1.925],
        [-3.96839,0.125,3.925],
        [-4.23355,0.5,3.925],
        [-5,1.04196,3.38304],
        [4,-2.5,0],
        [4.88763,-1.61237,0.887627],
        [4,-2.5,1.25529],
        [3.96839,-2.5,1.3],
        [5,-1.34108,1],
        [4,2.5,0],
        [5,2.5,1],
        [5,2.5,1.925],
        [3.96839,0.125,3.925],
        [4.23355,0.5,3.925],
        [5,1.04196,3.38304]],
      faces=[
        [2,0,1],
        [11,13,12],
        [0,5,1],
        [6,4,1],
        [5,6,1],
        [16,11,12],
        [15,17,12],
        [17,16,12],
        [8,14,3],
        [14,8,19],
        [10,20,9],
        [20,10,7],
        [18,21,7],
        [21,20,7],
        [14,15,13],
        [13,15,12],
        [19,15,14],
        [20,15,19],
        [20,21,15],
        [3,2,1],
        [4,10,1],
        [8,3,1],
        [10,9,1],
        [9,8,1],
        [2,3,0],
        [11,0,3],
        [5,0,11],
        [6,7,4],
        [18,6,5],
        [7,6,18],
        [7,10,4],
        [19,8,9],
        [13,11,3],
        [14,13,3],
        [11,16,5],
        [16,18,5],
        [15,21,17],
        [16,17,18],
        [20,19,9],
        [21,18,17]]);
}

module _footy_pocket_mesh() {
    polyhedron(points=[
        [-4.2,-2.7,-0.2],
        [-5.2,-2.7,0.8],
        [-5.2,-2.7,2.125],
        [-5.2,-1.24196,3.58304],
        [-5.2,-0.84196,3.58304],
        [-4.43355,-0.7,4.125],
        [-4.43355,-0.3,4.125],
        [-5.08763,1.41237,0.687627],
        [-5.2,1.54108,0.8],
        [-5.08763,1.81237,0.687627],
        [-4.2,2.7,-0.2],
        [-5.2,1.54108,1.2],
        [-5.08763,1.81237,1.08763],
        [-4.2,2.7,1.45529],
        [-4.16839,2.7,1.5],
        [-4.16839,0.075,4.125],
        [4.2,-2.7,-0.2],
        [5.2,-2.7,0.8],
        [5.2,-2.7,2.125],
        [5.2,-1.24196,3.58304],
        [5.2,-0.84196,3.58304],
        [4.43355,-0.7,4.125],
        [4.43355,-0.3,4.125],
        [5.08763,1.41237,0.687627],
        [5.2,1.54108,0.8],
        [5.08763,1.81237,0.687627],
        [4.2,2.7,-0.2],
        [5.2,1.54108,1.2],
        [5.08763,1.81237,1.08763],
        [4.2,2.7,1.45529],
        [4.16839,2.7,1.5],
        [4.16839,0.075,4.125]],
      faces=[
        [0,7,1],
        [1,8,2],
        [1,17,0],
        [2,17,1],
        [16,10,0],
        [2,3,5],
        [2,8,3],
        [3,8,4],
        [4,6,3],
        [3,6,5],
        [5,21,2],
        [5,6,21],
        [31,6,15],
        [10,7,0],
        [1,7,8],
        [4,8,11],
        [8,7,9],
        [9,7,10],
        [13,9,10],
        [8,9,11],
        [11,9,12],
        [12,9,13],
        [10,29,13],
        [13,29,14],
        [11,6,4],
        [12,6,11],
        [6,13,15],
        [12,13,6],
        [15,13,14],
        [14,31,15],
        [0,17,16],
        [18,17,2],
        [17,23,16],
        [18,27,17],
        [2,21,18],
        [21,6,22],
        [22,6,31],
        [21,19,18],
        [19,27,18],
        [20,27,19],
        [20,19,22],
        [22,19,21],
        [26,10,16],
        [26,29,10],
        [14,29,30],
        [16,25,26],
        [23,25,16],
        [17,25,23],
        [24,25,17],
        [17,27,24],
        [26,25,29],
        [27,25,24],
        [28,25,27],
        [29,25,28],
        [30,31,14],
        [22,27,20],
        [28,27,22],
        [31,29,22],
        [30,29,31],
        [22,29,28]]);
}


// ----------------------
// Hinges (helpers + main)
// ----------------------
module generate_hinge_components(bot,cuts){


hinge_w_clear = 2*hinge_comp_len+hinge_clear;
//compute the number of segments

segs= floor((hinge_axis_len-2*hinge_comp_len)/(hinge_w_clear));

//make sure that the number of segments is odd 
number_of_segs = segs + (1 - segs%2);

//because the above segments doesn't account for the last clearance, need to substract it out before computing the end segment lengths

end_seg_length = 3;
new_hinge = (hinge_axis_len - 2*end_seg_length -hinge_clear)/number_of_segs;
hinge_comp_len=(new_hinge-hinge_clear)/2;

hinge_cone_bot_dia = 2.5;
hinge_cone_top_dia = 0.5;
hing_cone_len = 1.0;

//generate the base-side cuts
if (bot==true && cuts==true){
    for (i = [0:number_of_segs-1]){
        if(!(i%2)){
            translate([9.5+end_seg_length+i*(2*hinge_comp_len+hinge_clear),0,0])
                _cyl(2*hinge_comp_len+2*hinge_clear,hinge_dia/2+hinge_clear,hinge_dia/2+hinge_clear, "right");
           }
    }
}
//generate the lid-side hinges
if (bot==false && cuts==false){
        
    //loop through the rest of the segements    
    for (i = [0:number_of_segs-1]){
        
        if(!(i%2)){
            loc = 9.5+end_seg_length+i*(2*hinge_comp_len+hinge_clear)+hinge_clear;
            difference(){
            union(){
                
                translate([loc,0,0])
                    _cyl(2*hinge_comp_len,hinge_dia/2,hinge_dia/2, "right");
                 translate([loc,0,0])
                rotate([0,90,0])
                linear_extrude(height=2*hinge_comp_len) {
                    polygon(points=[[0,0.5], [2.63,0.5], [0.8677, -1.2232]]);    
            }                  
                
            }
            //add the left and right cones to the hinges
                translate([loc,0,0])
                _cyl(hing_cone_len,hinge_cone_bot_dia/2,hinge_cone_top_dia/2, "right");
            translate([loc+2*hinge_comp_len,0,0])
                _cyl(hing_cone_len,hinge_cone_bot_dia/2,hinge_cone_top_dia/2, "left");
            
        }
    }

}
}

//generate the base-side hinge components
if (bot==true && cuts==false){
    //create the end segments first because they don't fit well in the loop
    //start with the cylinder
    translate([9.5,0,0])
        _cyl(end_seg_length,hinge_dia/2,hinge_dia/2, "right");
    //add the wedge support for easy printing
    translate([9.5,0,0])
        rotate([0,90,0])
        linear_extrude(height=end_seg_length) {
            polygon(points=[[0,0.5], [2.63,0.5], [0.8677, -1.2232]]);
        }
    //add the interlocking cone features
    translate([9.5+end_seg_length,0,0])
        _cyl(hing_cone_len,hinge_cone_bot_dia/2,hinge_cone_top_dia/2, "right");
        
    //need to check if the number of segments is odd or even        
        translate([9.5+end_seg_length+hinge_clear+number_of_segs*(2*hinge_comp_len+hinge_clear),0,0])
            _cyl(end_seg_length,hinge_dia/2,hinge_dia/2, "right");
                
        translate([9.5+end_seg_length+hinge_clear+number_of_segs*(2*hinge_comp_len+hinge_clear),0,0])
            rotate([0,90,0])
            linear_extrude(height=end_seg_length) {
                polygon(points=[[0,0.5], [2.63,0.5], [0.8677, -1.2232]]);
            }
        translate([9.5+end_seg_length+hinge_clear+number_of_segs*(2*hinge_comp_len+hinge_clear),0,0])
            _cyl(hing_cone_len,hinge_cone_bot_dia/2,hinge_cone_top_dia/2, "left");


        
    //loop through the rest of the segements    
    for (i = [0:number_of_segs-1]){
        
        if((i%2)){
            loc = 9.5+end_seg_length+i*(2*hinge_comp_len+hinge_clear)+hinge_clear;
            translate([loc,0,0])
                _cyl(2*hinge_comp_len,hinge_dia/2,hinge_dia/2, "right");
            translate([loc,0,0])
            rotate([0,90,0])
            linear_extrude(height=2*hinge_comp_len) {
                polygon(points=[[0,0.5], [2.63,0.5], [0.8677, -1.2232]]);
            }
            //add the left and right cones to the hinges
            translate([loc,0,0])
                _cyl(hing_cone_len,hinge_cone_bot_dia/2,hinge_cone_top_dia/2, "left");
            translate([loc+2*hinge_comp_len,0,0])
                _cyl(hing_cone_len,hinge_cone_bot_dia/2,hinge_cone_top_dia/2, "right");
            
        }
    }

}


//generate the lid-side cuts
if (bot==false && cuts==true){
    //create the end segments first because they don't fit well in the loop
    //start with the cylinder
    translate([9,0,0])
        _cyl(end_seg_length+0.75,hinge_dia/2+hinge_clear,hinge_dia/2+hinge_clear, "right");


    translate([9.25+end_seg_length+hinge_clear+number_of_segs*(2*hinge_comp_len+hinge_clear),0,0])
        _cyl(end_seg_length+0.75,hinge_dia/2+hinge_clear,hinge_dia/2+hinge_clear, "right");
            
        
    //loop through the rest of the segements    
    for (i = [0:number_of_segs-1]){
        
        //make the cuts for the base hinge clearance
        if((i%2)){
            loc = 9.5+end_seg_length+i*(2*hinge_comp_len+hinge_clear);
            translate([loc,0,0])
                _cyl(2*hinge_comp_len+2*hinge_clear,hinge_dia/2+hinge_clear,hinge_dia/2+hinge_clear, "right");
  
        }
        //cut away the extra material before ading the hinge
        if(!(i%2)){
            translate([9.5+end_seg_length+i*(2*hinge_comp_len+hinge_clear),0,0])
                _cyl(2*hinge_comp_len+2*hinge_clear,hinge_dia/2-.2,hinge_dia/2-.2, "right");
           }
    }

}

}

// ----------------------
// Dividers (primitives)
// ----------------------
// ROW divider — spans depth (Y), placed at X = internal vertical line.
// corner_flags = [back_left, back_right, front_left, front_right]
module generate_row_divider(div_h, div_w, div_t, bot_chamf_flag, chamf_size, corner_flags=[true,true,true,true]) {
    cf = is_list(corner_flags) && len(corner_flags)==4 ? corner_flags : [corner_flags,corner_flags,corner_flags,corner_flags];

    // body
    rotate([0,270,0]) translate([0,0,-div_t/2]) cube([div_h, div_w, div_t]);

    // back edge (y=0): left & right
    if (cf[0]) linear_extrude(height=div_h) translate([-div_t/2, 0])     polygon(points=[[0,0],[0, 2],[-2,0]]);
    if (cf[1]) linear_extrude(height=div_h) translate([ div_t/2, 0])     polygon(points=[[0,0],[0, 2],[ 2,0]]);
    // front edge (y=div_w): left & right
    if (cf[2]) linear_extrude(height=div_h) translate([-div_t/2, div_w]) polygon(points=[[0,0],[0,-2],[-2,0]]);
    if (cf[3]) linear_extrude(height=div_h) translate([ div_t/2, div_w]) polygon(points=[[0,0],[0,-2],[ 2,0]]);

    // optional bottom chamfers (along Y)
    if (bot_chamf_flag)
        for (sx = [-1, 1]) {
            rotate([270,0,0])
            linear_extrude(height=div_w)
                translate([sx*div_t/2, 0])
                    polygon(points=[[0,0],[0,-chamf_size],[sx*chamf_size,0]]);
        }
}

// COL divider — spans width (X), placed at Y = internal horizontal line.
// corner_flags = [left_back, left_front, right_back, right_front]
module generate_col_divider(div_h, div_w, div_t, bot_chamf_flag, chamf_size, corner_flags=[true,true,true,true]) {
    cf = is_list(corner_flags) && len(corner_flags)==4 ? corner_flags : [corner_flags,corner_flags,corner_flags,corner_flags];

    // body
    rotate([0,270,270]) translate([0,0,-div_t/2]) cube([div_h, div_w, div_t]);

    // left edge (x=0): back & front
    if (cf[0]) linear_extrude(height=div_h) translate([0, -div_t/2])     polygon(points=[[0,0],[ 2,0],[0,-2]]);
    if (cf[1]) linear_extrude(height=div_h) translate([0,  div_t/2])     polygon(points=[[0,0],[ 2,0],[0, 2]]);
    // right edge (x=div_w): back & front
    if (cf[2]) linear_extrude(height=div_h) translate([div_w, -div_t/2]) polygon(points=[[0,0],[-2,0],[0,-2]]);
    if (cf[3]) linear_extrude(height=div_h) translate([div_w,  div_t/2]) polygon(points=[[0,0],[-2,0],[0, 2]]);

    // optional bottom chamfers (along X)
    if (bot_chamf_flag)
        for (sy = [-1, 1]) {
            rotate([0,90,0])
            linear_extrude(height=div_w)
                translate([0, sy*div_t/2])
                    polygon(points=[[0,0],[0,sy*chamf_size],[-chamf_size,0]]);
        }
}

// ----------------------
// Shadowbox inserts
// ----------------------
_base_grid_origin = [-base_w/2 + base_t, base_t + 1.5, shell_bottom_t - .1];

function _col_at(fx) = len([for (i = [1:1:_C - 1]) if (_xs[i] <= fx) i]);
function _row_at(fy) = len([for (i = [1:1:_R - 1]) if (_ys[i] <= fy) i]);
function _region_at(fx, fy) = _cells[_row_at(fy) * _C + _col_at(fx)];

// Height of the fill in the compartment containing (fx, fy); 0 if it is not filled.
function _fill_height_at(fx, fy) =
    let(id = _region_at(fx, fy),
        hs = [for (f = fills) if (_region_at(f[0], f[1]) == id) f[2]])
    len(hs) ? min(max(hs), box_internal_h) : 0;

// The base's inner cavity, in grid coordinates, so fills follow its chamfered
// corners and floor instead of poking through the shell.
module _base_cavity_in_grid() {
    translate(-_base_grid_origin)
    translate([0, base_outer_d/2 + 0.5 + 0.5, 1.6 - 0.1])
        generate_edge_chamfered_cuboid(base_w - 2*base_t, base_outer_d - 2*base_t - 1,
                                       base_lip_top_h, 4.8284, 3.8284);
}

module _tool_mesh(t) {
    translate([0, 0, 0]) rotate([0, 0, t[3]]) translate([t[9], t[10], t[11]])
        rotate([t[4], t[5], 0]) import(t[0]);
}

module _tool_cutter(t) {
    W = box_internal_w;
    D = box_internal_d;
    clearance = max(t[7], 0);
    top = 0.1 + _fill_height_at(t[1] / W, t[2] / D);
    translate([t[1], t[2], top - t[6]])
        if (t[8] == "exact") {
            // Grow the imprint by the clearance along each axis (and downwards).
            for (d = [[0, 0, 0], [clearance, 0, 0], [-clearance, 0, 0],
                      [0, clearance, 0], [0, -clearance, 0], [0, 0, -clearance]])
                translate(d) _tool_mesh(t);
        } else {
            linear_extrude(t[6] + box_internal_h + 1)
                offset(delta = clearance) projection() _tool_mesh(t);
        }
}

module generate_inserts() {
    W = box_internal_w;
    D = box_internal_d;
    difference() {
        intersection() {
            union() for (f = fills) {
                id = _region_at(f[0], f[1]);
                h = min(f[2], box_internal_h);
                for (r = [0:1:_R - 1], c = [0:1:_C - 1]) if (_cells[r * _C + c] == id)
                    translate([_xs[c] * W, _ys[r] * D, 0])
                        cube([(_xs[c + 1] - _xs[c]) * W, (_ys[r + 1] - _ys[r]) * D, 0.1 + h]);
            }
            _base_cavity_in_grid();
        }
        for (t = tools) _tool_cutter(t);
    }
}

// ----------------------
// Layout divider generator
// ----------------------
// Wall on internal vertical line i (1..C-1) in row r
function _vwall(cells, R, C, r, i) =
    (r >= 0 && r < R && i >= 1 && i <= C - 1) && cells[r * C + i - 1] != cells[r * C + i];

// Wall on internal horizontal line j (1..R-1) in column c
function _hwall(cells, R, C, j, c) =
    (j >= 1 && j <= R - 1 && c >= 0 && c < C) && cells[(j - 1) * C + c] != cells[j * C + c];

// xf / yf: grid line positions as fractions, including 0 and 1.
// A gusset is added in each corner where the wall meets another wall or the shell.
module generate_layout_dividers(W, D, H, xf, yf, cells, bot_chamf_flag=false, chamf_size=2) {
    C  = len(xf) - 1;
    R  = len(yf) - 1;
    xs = [for (f = xf) f * W];
    ys = [for (f = yf) f * D];

    // Walls running along Y
    for (i = [1:1:C - 1], r = [0:1:R - 1]) if (_vwall(cells, R, C, r, i)) {
        // [back_left, back_right, front_left, front_right]
        cf = [ r == 0     || _hwall(cells, R, C, r,     i - 1),
               r == 0     || _hwall(cells, R, C, r,     i),
               r == R - 1 || _hwall(cells, R, C, r + 1, i - 1),
               r == R - 1 || _hwall(cells, R, C, r + 1, i) ];
        translate([xs[i], ys[r], 0])
            generate_row_divider(H, ys[r + 1] - ys[r], div_t, bot_chamf_flag, chamf_size, cf);
    }

    // Walls running along X
    for (j = [1:1:R - 1], c = [0:1:C - 1]) if (_hwall(cells, R, C, j, c)) {
        // [left_back, left_front, right_back, right_front]
        cf = [ c == 0     || _vwall(cells, R, C, j - 1, c),
               c == 0     || _vwall(cells, R, C, j,     c),
               c == C - 1 || _vwall(cells, R, C, j - 1, c + 1),
               c == C - 1 || _vwall(cells, R, C, j,     c + 1) ];
        translate([xs[c], ys[j], 0])
            generate_col_divider(H, xs[c + 1] - xs[c], div_t, bot_chamf_flag, chamf_size, cf);
    }
}
