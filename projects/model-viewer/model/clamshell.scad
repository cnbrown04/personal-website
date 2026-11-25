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
// The label pocket is centred on the box height, or lower to make room for a pry notch
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
// label_h_loc (the pocket's centre height) is set under Easy Open: the pry notch can push it down

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

/* [Easy Open] Ways to make the lid easier to open; the snaps hold just the same */
// Curved notches in the front seam, either side of the front snap, with chamfered edges for a fingertip to push the lid up (a coin twisted in works too)
pry_notch = false;

/* [Gridfinity] A Gridfinity bin that holds closed boxes of the size above, standing on their hinge side */
// Add the bin, built beside the box; it downloads with it
gridfinity = false;
// Bin width in 42 mm grid units, left to right
gridfinity_x = 4;       // [1:12]
// Bin depth in 42 mm grid units, front to back
gridfinity_y = 4;       // [1:12]
// How far each box sits down into the bin (mm)
gridfinity_depth = 14;  // [6:1:60]
// Height of the pocket floor above the bottom of the bin; lower it to drop the boxes, and the whole bin, down (mm)
gridfinity_floor = 9.5;  // [6:0.1:20]
// Magnet holes under each grid square, four per square
gridfinity_magnets = false;
// Magnet diameter; the hole is 0.5 mm wider (mm)
gridfinity_magnet_d = 6;     // [2:0.1:7.5]
// Magnet thickness; the hole is 0.4 mm deeper (mm)
gridfinity_magnet_h = 2;     // [0.5:0.1:4]
// How the magnets stay in: "press fit" has eight thin crush ribs inside the hole that grip the magnet, no glue needed; "glue" is a plain hole
gridfinity_magnet_fit = "press fit"; // ["press fit", "glue"]

/* [Dividers] */
bottom_chamfer = false;
chamfer_size   = 2;
// Repeat the base's compartment layout inside the lid
lid_dividers = true;
// A curved ramp along the front of each compartment in the base, so small parts slide up and out under a fingertip
finger_scoops = false;
// Finger scoop size: the radius of the curve; smaller in shallow or short compartments (mm)
scoop_radius = 10;      // [3:0.5:30]

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
mv_part = "all"; // ["all", "base", "lid", "dividers", "inserts", "gridfinity"]
// Downloading one part on its own: build it at the origin instead of beside the box
mv_solo = false;
function _mv_build(part) = mv_part == "all" || mv_part == part;
// Settings each part does not depend on (keep these conservative: a missing
// entry only costs a re-render, a wrong one would show a stale part).
mv_ignore_base     = ["col_splits", "row_splits", "cells", "lid_dividers", "bottom_chamfer", "chamfer_size", "divider_color", "fills", "tools", "insert_color", "snap_depth", "side_snap_catch_depth", "gridfinity", "gridfinity_x", "gridfinity_y", "gridfinity_depth", "gridfinity_floor", "gridfinity_magnets", "gridfinity_magnet_d", "gridfinity_magnet_h", "gridfinity_magnet_fit"];
mv_ignore_lid      = ["col_splits", "row_splits", "cells", "lid_dividers", "bottom_chamfer", "chamfer_size", "divider_color", "fills", "tools", "insert_color", "label_width", "label_height", "snap_catch_depth", "side_snap_depth", "pry_notch", "finger_scoops", "scoop_radius", "gridfinity", "gridfinity_x", "gridfinity_y", "gridfinity_depth", "gridfinity_floor", "gridfinity_magnets", "gridfinity_magnet_d", "gridfinity_magnet_h", "gridfinity_magnet_fit"];
mv_ignore_dividers = ["footy", "label_width", "label_height", "hinge_clear", "hinge_dia", "hinge_comp_len", "tools", "insert_color", "snap_fit", "front_snap", "side_snaps", "snap_width", "snap_depth", "snap_catch_depth", "snap_height", "side_snap_length", "side_snap_depth", "side_snap_catch_depth", "pry_notch", "gridfinity", "gridfinity_x", "gridfinity_y", "gridfinity_depth", "gridfinity_floor", "gridfinity_magnets", "gridfinity_magnet_d", "gridfinity_magnet_h", "gridfinity_magnet_fit"];
mv_ignore_inserts  = ["footy", "label_width", "label_height", "hinge_clear", "hinge_dia", "hinge_comp_len", "lid_dividers", "bottom_chamfer", "chamfer_size", "divider_color", "snap_fit", "front_snap", "side_snaps", "snap_width", "snap_depth", "snap_catch_depth", "snap_height", "side_snap_length", "side_snap_depth", "side_snap_catch_depth", "pry_notch", "finger_scoops", "scoop_radius", "gridfinity", "gridfinity_x", "gridfinity_y", "gridfinity_depth", "gridfinity_floor", "gridfinity_magnets", "gridfinity_magnet_d", "gridfinity_magnet_h", "gridfinity_magnet_fit"];
mv_ignore_gridfinity = ["label_width", "label_height", "snap_fit", "front_snap", "side_snaps", "snap_width", "snap_depth", "snap_catch_depth", "snap_height", "side_snap_length", "side_snap_depth", "side_snap_catch_depth", "pry_notch", "bottom_chamfer", "chamfer_size", "lid_dividers", "finger_scoops", "scoop_radius", "col_splits", "row_splits", "cells", "fills", "tools", "divider_color", "insert_color"];

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
// Pry notch: a curved scallop down into the middle of the top of the base's
// front tab, up to the lid's top plate. The front snap is split in two, one
// either side of it, each half as wide (but at least 5 mm), so the hold stays. Its front edge flares out at 45° so a fingertip slides in.
// The label pocket on the front can reach nearly to the top, so the notch stays
// 0.6 mm clear of it. With the notch on, the label moves down from centre as far
// as it needs to for the full notch, but keeps its bottom edge 3 mm up (1 mm above
// the 2 mm bottom chamfer). If that's still not enough, the notch gets shallower,
// and the flare at the bottom of the arc is only as deep as there is room for.
_has_label      = label_w > 0 && label_h > 0;
_notch_w        = 14;                // width where it meets the lid, inside the flare
_notch_c        = 1;                 // 45° flare on the sides
// The pocket's front face spans label_h_loc - label_h/2 to label_h_loc + label_h/2 + 0.5
_label_hi       = base_h - 0.6 - 2 - _notch_c - label_h/2 - 0.5;  // highest centre for the full notch
_label_lo       = 3 + label_h/2;                                   // lowest centre allowed
label_h_loc     = pry_notch && _has_label
                    ? min(box_h/2, max(_label_hi, min(_label_lo, box_h/2)))
                    : box_h/2;
_label_top      = _has_label ? label_h_loc + label_h/2 + 0.5 : 0;
_notch_room     = base_h - _label_top - 0.6;
_notch_h        = min(2, _notch_room);  // depth in the middle; plus the 0.2 mm seam
_notch_b        = max(0, min(_notch_c, _notch_room - _notch_h));  // flare at the bottom
_notch_r        = (_notch_w*_notch_w/4 + _notch_h*_notch_h) / (2*_notch_h);  // arc radius
_notch_half     = _notch_w/2 + _notch_c;  // half its width at the front face
_split_w        = max(_snap_w/2, 5);    // each front snap when split
_split_x        = _notch_half + 1 + _split_w/2;
_notch_fits     = (front_snap ? _split_x + _split_w/2 : _notch_half) <= (box_w - 30)/2 - 1;
_notch_ok       = _notch_h >= 1.2 && _notch_fits;
_pry            = pry_notch && _notch_ok;
// The front snaps actually built: centres and each one's width
_snap_xs        = _pry ? [-_split_x, _split_x] : [0];
_snap_wd        = _pry ? _split_w : _snap_w;

// What the web viewer should grey out or warn about, as [param, "off" | "note", why].
// Reported with the base, so everything read here must stay out of mv_ignore_base.
function _custom_snap_hint(used, what) =
    snap_fit != "custom" ? "Only used when snap_fit is custom" :
    !used ? str("The ", what, " is not in use") : "";
_hints = [
    if (!finger_scoops) ["scoop_radius", "off", "Only used by finger scoops"],
    if (!front_snap && !side_snaps) ["snap_fit", "off", "No snaps are in use"],
    if (pry_notch && !_notch_ok)
        ["pry_notch", "note", _notch_h < 1.2
            ? "The label is too tall for this box height to leave room for the notch, even moved down, so it has none"
            : front_snap ? "The box is too narrow for the notch between two front snaps, so it has none"
                         : "The box is too narrow for the notch, so it has none"],
    for (n = ["snap_width", "snap_depth", "snap_catch_depth", "snap_height"])
        let (why = _custom_snap_hint(front_snap, "front snap")) if (why != "") [n, "off", why],
    for (n = ["side_snap_length", "side_snap_depth", "side_snap_catch_depth"])
        let (why = _custom_snap_hint(side_snaps, "side snap")) if (why != "") [n, "off", why],
];
if (_mv_build("base")) echo(str("MV_HINTS=", _hints));

// --- Gridfinity bin params
// A standard Gridfinity bin (42 mm grid, 4.75 mm feet that drop into a baseplate)
// with a pocket per box. A closed box stands on its hinge side: its back face,
// 0.5 mm behind the hinge axis, rests on the pocket floor, and the feet and hinge
// knuckles that stick out of it sit in recesses below the floor. Pocket and
// recess sizes are in the pocket's own frame: u across the box's width, v up its
// closed height (base side at -v), both centred.
_gf_w        = gridfinity_x * 42 - 0.5;   // outer size: half a millimetre under the grid
_gf_d        = gridfinity_y * 42 - 0.5;
_gf_r        = 3.75;                      // outer corner radius
_gf_floor    = gridfinity_floor;          // pocket floor, above the 4.75 mm feet
_gf_h        = _gf_floor + gridfinity_depth;
_gf_c        = 2;                         // outer top chamfer, and the lead-in flare round each pocket
_gf_clear    = 0.5;                       // gap round the box
// The side grips stand 0.5 mm proud from box_d - 23.5 mm above the back face;
// give them room if they reach down into the pocket.
_gf_side     = _gf_clear + (gridfinity_depth > box_d - 23.5 ? 0.5 : 0);
_gf_pw       = box_w + 2*_gf_side;        // pocket, across the box
_gf_ph       = box_h + 2*_gf_clear;       // pocket, across its height
_gf_pk       = 2 + 2*_gf_clear*tan(22.5); // corner chamfer: the box's 2 mm one, offset
_gf_rc       = 0.3;                       // gap round the feet and knuckles
_gf_recess   = max(2.5, 0.5 + hinge_dia/2) + _gf_rc;  // feet stick out 2.5 mm, knuckles 0.5 + radius
// [u0, u1, v0, v1] for each recess
_gf_foot_u   = [box_w/2 - 21.82843, box_w/2 - 10.82843];  // base feet, lid feet (centres)
_gf_hv       = max(2.63, hinge_dia/2) + _gf_rc;           // knuckle fins reach 2.63 mm off the axis
_gf_recesses = [
    [-hinge_axis_len/2 - _gf_rc, hinge_axis_len/2 + _gf_rc, -_gf_hv, _gf_hv],
    if (footy) for (sx = [-1, 1]) each [
        [sx*_gf_foot_u[0] - 5 - _gf_rc, sx*_gf_foot_u[0] + 5 + _gf_rc, -_gf_ph/2, -box_h/2 + 3.8 + _gf_rc],
        [sx*_gf_foot_u[1] - 5 - _gf_rc, sx*_gf_foot_u[1] + 5 + _gf_rc, box_h/2 - 3.8 - _gf_rc, _gf_ph/2],
    ],
];
// As many pockets as fit with walls of at least 5 mm, between them and at the
// edges; turned a quarter turn (box width front to back) if that fits more. The
// room left over is shared out evenly, so every wall along a row is the same.
_gf_gap      = 5;
_gf_margin   = 5;
function _gf_fit(len, room) = max(0, floor((room - 2*_gf_margin + _gf_gap) / (len + _gf_gap)));
_gf_n0       = [_gf_fit(_gf_pw, _gf_w), _gf_fit(_gf_ph, _gf_d)];
_gf_n1       = [_gf_fit(_gf_ph, _gf_w), _gf_fit(_gf_pw, _gf_d)];
_gf_turn     = _gf_n1[0] * _gf_n1[1] > _gf_n0[0] * _gf_n0[1];
_gf_n        = _gf_turn ? _gf_n1 : _gf_n0;
_gf_size     = _gf_turn ? [_gf_ph, _gf_pw] : [_gf_pw, _gf_ph];   // a pocket's footprint in x, y
// pocket + wall, with n pockets and n + 1 equal walls across the bin
_gf_step     = [for (k = [0, 1]) let (room = k == 0 ? _gf_w : _gf_d)
                   _gf_size[k] + (room - _gf_n[k] * _gf_size[k]) / (_gf_n[k] + 1)];
_gf_pockets  = [for (j = [0:1:_gf_n[1] - 1], i = [0:1:_gf_n[0] - 1])
                   [(i - (_gf_n[0] - 1)/2) * _gf_step[0], (j - (_gf_n[1] - 1)/2) * _gf_step[1]]];
// Where the bin goes in the print layout: right of the box
_gf_at       = box_w/2 + 0.5 + 10 + _gf_w/2;
// Magnet holes: 0.5 mm wider and 0.4 mm deeper than the magnet, with a 0.5 mm
// chamfer at the mouth. Press fit adds eight ribs, 0.8 mm wide, reaching in to
// 0.1 mm under the magnet's diameter, which crush as it's pushed in.
_gf_mag_r    = gridfinity_magnet_d/2 + 0.25;
_gf_mag_h    = gridfinity_magnet_h + 0.4;
_gf_mag_ribs = gridfinity_magnet_fit == "press fit";
_gf_rib_r    = gridfinity_magnet_d/2 - 0.05;  // ribs' inner face, from the hole's centre

_gf_hints = [
    if (!gridfinity) for (n = ["gridfinity_x", "gridfinity_y", "gridfinity_depth", "gridfinity_floor", "gridfinity_magnets",
                               "gridfinity_magnet_d", "gridfinity_magnet_h", "gridfinity_magnet_fit"])
        [n, "off", "Only used by the Gridfinity bin"],
    if (gridfinity && !gridfinity_magnets) for (n = ["gridfinity_magnet_d", "gridfinity_magnet_h", "gridfinity_magnet_fit"])
        [n, "off", "Only used with magnet holes"],
    if (gridfinity && _gf_floor - _gf_recess < 4.75 + 0.6)
        ["gridfinity_floor", "note", str("The recesses for the hinge", footy ? " and feet" : "", " go ",
            _gf_recess, " mm below the floor, so under ", 4.75 + 0.6 + _gf_recess,
            " mm they leave a thin or open base where they cross the gaps between the grid feet")],
    if (gridfinity && len(_gf_pockets) == 0)
        ["gridfinity", "note", str("No box fits a ", gridfinity_x, " x ", gridfinity_y,
            " bin, so it has no pockets; it needs about ", _gf_pw + 2*_gf_margin, " x ",
            _gf_ph + 2*_gf_margin, " mm")],
];
if (_mv_build("gridfinity")) echo(str("MV_HINTS=", _gf_hints));

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

// Finger scoops: [x0, x1, y, radius] in the base's divider grid for every cell
// whose front edge is a wall (the shell, or a divider to another compartment).
// Filled compartments get none, and the radius shrinks to fit the cell.
_fill_ids = [for (f = fills) _region_at(f[0], f[1])];
_scoops = !finger_scoops ? [] : [
    for (r = [0:1:_R - 1], c = [0:1:_C - 1])
        let (id    = _cells[r * _C + c],
             front = r == _R - 1 || _cells[(r + 1) * _C + c] != id,
             yf    = _ys[r + 1] * box_internal_d - (r == _R - 1 ? 0 : div_t/2),
             yb    = _ys[r] * box_internal_d + (r == 0 ? 0 : div_t/2),
             rad   = min(scoop_radius, (yf - yb)/2, box_internal_h))
        if (front && len([for (i = _fill_ids) if (i == id) 1]) == 0 && rad >= 1)
            [_xs[c] * box_internal_w, _xs[c + 1] * box_internal_w, yf, rad]
];
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

        // --- finger scoops (base)
        if (len(_scoops) > 0)
        color(divider_color)
        translate(_base_grid_origin)
            generate_scoops();

        // --- compartment dividers (lid)
        if (lid_dividers)
        color(divider_color)
        translate([-lid_w/2+lid_side_t, -lid_outer_d+2.5, shell_bottom_t-.1])
            generate_layout_dividers(box_internal_w, lid_internal_d, lid_internal_h + 0.1,
                                     _xs, _lid_ys, _lid_cells, false, chamfer_size);
    }

    // --- Gridfinity bin, beside the box
    if (_mv_build("gridfinity") && gridfinity)
    color("#FFFFFF")
    translate([mv_solo ? 0 : _gf_at, 0, 0])
        generate_gridfinity();

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
    ["front_snap", front_snap], ["side_snaps", side_snaps],
    ["snap_w", _snap_wd], ["snap_xs", _snap_xs], ["snap_depth", _snap_depth], ["snap_catch", _snap_catch], ["snap_h", _snap_h],
    ["side_snap_l", _side_snap_l], ["side_snap_d", _side_snap_d], ["side_snap_c", _side_snap_c],
    ["side_snap_zh", _side_snap_zh], ["side_snap_z", _side_snap_z],
    ["pry", _pry], ["notch_h", _notch_h], ["notch_c", _notch_c], ["notch_b", _notch_b], ["notch_r", _notch_r],
    ["div_t", div_t], ["shell_bottom_t", shell_bottom_t],
    ["box_internal_w", box_internal_w], ["box_internal_d", box_internal_d], ["box_internal_h", box_internal_h],
    ["lid_internal_d", lid_internal_d], ["lid_internal_h", lid_internal_h],
    ["xs", _xs], ["ys", _ys], ["cells", _cells], ["lid_ys", _lid_ys], ["lid_cells", _lid_cells],
    ["lid_dividers", lid_dividers], ["bottom_chamfer", bottom_chamfer], ["chamfer_size", chamfer_size],
    ["divider_color", divider_color], ["insert_color", insert_color],
    ["fills", fills], ["tools", len(tools)], ["scoops", _scoops],
    ["gridfinity", gridfinity], ["gf_x", gridfinity_x], ["gf_y", gridfinity_y], ["gf_w", _gf_w], ["gf_d", _gf_d],
    ["gf_r", _gf_r], ["gf_floor", _gf_floor], ["gf_h", _gf_h], ["gf_c", _gf_c], ["gf_pw", _gf_pw], ["gf_ph", _gf_ph],
    ["gf_pk", _gf_pk], ["gf_recess", _gf_recess], ["gf_recesses", _gf_recesses], ["gf_turn", _gf_turn],
    ["gf_pockets", _gf_pockets], ["gf_magnets", gridfinity_magnets], ["gf_at", _gf_at],
    ["gf_mag_r", _gf_mag_r], ["gf_mag_h", _gf_mag_h], ["gf_mag_ribs", _gf_mag_ribs], ["gf_rib_r", _gf_rib_r],
]));


// ----------------------
// Base & Lid top-level
// ----------------------
module generate_base(base_w, base_d, base_h, base_t) {
    difference() {
        generate_base_shell(base_w, base_d, base_h, base_lip_top_h, base_lip_bot_h, base_t);

        // interior latch
        if (front_snap) for (x = _snap_xs)
        translate([x, base_d/2-base_t, box_h-3.5])
            _prismoid([_snap_wd, _snap_h-0.2], [_snap_wd, 0.6], _snap_catch, orient="back");

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

        if (_pry) _pry_notch(base_d);
    }

    // hinge components
    translate([-base_w/2, -base_d/2-.5, box_h/2])
        generate_hinge_components(true, false);

    // side snap ridges on the outside of the lip
    if (side_snaps)
    for (sx = [-1, 1])
        translate([sx*(base_w/2 - 1.2), 0.5, _side_snap_z])
            _prismoid([_side_snap_zh, _side_snap_l], [0.6, _side_snap_l - 1], 0.3 + _side_snap_d,
                      orient=(sx == 1 ? "right" : "left"));
}

module generate_lid(lid_w, lid_outer_d, lid_h, lid_side_t, lid_fb_t) {
    difference() {
        generate_lid_shell(lid_w, lid_outer_d, lid_h, lid_lip_bot_h, lid_lip_top_h, lid_side_t, lid_fb_t);

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
        if (side_snaps)
        for (sx = [-1, 1])
            translate([sx*(lid_w/2 - 1), 0.5, 6.5])
                _prismoid([_side_snap_zh + 0.2, _side_snap_l + 1], [0.8, _side_snap_l], 0.1 + _side_snap_c,
                          orient=(sx == 1 ? "right" : "left"));
    }


    // hinge components
    translate([-base_w/2, -base_d/2+.75, box_h/2])
        generate_hinge_components(false, false);

    // external latch
    if (front_snap) for (x = _snap_xs) translate([x, 0, 0])
    difference() {
        translate([0, lid_outer_d/2-2.1, 3.5])
            _prismoid([_snap_wd+0.4, _snap_h], [_snap_wd-1.2, 0.6], _snap_depth, orient="back");
        for (sx = [-1, 1])
            translate([sx*(_snap_wd/2+0.5), lid_outer_d/2-2.1+.5, 3.5-(_snap_h+0.1)/2])
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
    _grip_pair_on_side(+1, l, y_grip, 2.95, 0.95);
    _grip_pair_on_side(-1, l, y_grip, 2.95, 0.95);

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
    _grip_pair_on_side(+1, l, y_grip, 2.95, 1.0);
    _grip_pair_on_side(-1, l, y_grip, 2.95, 1.0);

    if(footy){
    // back feet (lid uses 5.82843 offset)
    translate([ base_w/2 - 5.82843 - 5, -w/2, 0]) generate_footy();
    translate([-base_w/2 + 5.82843 + 5, -w/2, 0]) generate_footy();
    }
}

// ----------------------
// Gridfinity bin
// ----------------------
module generate_gridfinity() {
    difference() {
        union() {
            for (i = [0:gridfinity_x - 1], j = [0:gridfinity_y - 1])
                translate([(i - (gridfinity_x - 1)/2) * 42, (j - (gridfinity_y - 1)/2) * 42, 0])
                    _gf_foot();
            // body, with a 45° chamfer round the top
            hull() {
                translate([0, 0, 4.75]) linear_extrude(_gf_h - _gf_c - 4.75) _gf_rounded(_gf_w, _gf_d, _gf_r);
                translate([0, 0, _gf_h - 0.001]) linear_extrude(0.001)
                    _gf_rounded(_gf_w - 2*_gf_c, _gf_d - 2*_gf_c, _gf_r - _gf_c);
            }
        }
        for (p = _gf_pockets) translate([p[0], p[1], 0]) rotate(_gf_turn ? 90 : 0) _gf_pocket();
        if (gridfinity_magnets)
            for (i = [0:gridfinity_x - 1], j = [0:gridfinity_y - 1], dx = [-13, 13], dy = [-13, 13])
                translate([(i - (gridfinity_x - 1)/2) * 42 + dx, (j - (gridfinity_y - 1)/2) * 42 + dy, 0])
                    _gf_magnet_hole();
    }
}

module _gf_magnet_hole() {
    difference() {
        translate([0, 0, -1]) cylinder(r = _gf_mag_r, h = 1 + _gf_mag_h);
        if (_gf_mag_ribs) for (k = [0:7]) rotate(k * 45)
            translate([_gf_rib_r, -0.4, -1]) cube([_gf_mag_r + 0.2 - _gf_rib_r, 0.8, 1 + _gf_mag_h + 0.1]);
    }
    // chamfer at the mouth
    translate([0, 0, -0.5]) cylinder(r1 = _gf_mag_r + 1, r2 = _gf_mag_r, h = 1);
}

// Rounded rectangle, centred
module _gf_rounded(w, d, r) {
    offset(r = r) square([w - 2*r, d - 2*r], center = true);
}

// One grid square's foot, the standard Gridfinity profile: 0.8 mm at 45°, 1.8 mm
// straight, 2.15 mm at 45° up to the 41.5 mm square at z = 4.75. The profile
// steps in at the straight part, so it's two hulls, not one.
module _gf_foot() {
    hull() {
        linear_extrude(0.001) _gf_rounded(35.6, 35.6, 0.8);
        translate([0, 0, 0.8]) linear_extrude(1.8) _gf_rounded(37.2, 37.2, 1.6);
    }
    hull() {
        translate([0, 0, 2.6 - 0.001]) linear_extrude(0.001) _gf_rounded(37.2, 37.2, 1.6);
        translate([0, 0, 4.75 - 0.001]) linear_extrude(0.001) _gf_rounded(41.5, 41.5, 3.75);
    }
}

// The box's outline seen from behind, with its 2 mm corner chamfers, plus clearance
module _gf_pocket_outline(grow = 0) {
    offset(delta = grow) polygon([
        [-_gf_pw/2 + _gf_pk, -_gf_ph/2], [_gf_pw/2 - _gf_pk, -_gf_ph/2], [_gf_pw/2, -_gf_ph/2 + _gf_pk],
        [_gf_pw/2, _gf_ph/2 - _gf_pk], [_gf_pw/2 - _gf_pk, _gf_ph/2], [-_gf_pw/2 + _gf_pk, _gf_ph/2],
        [-_gf_pw/2, _gf_ph/2 - _gf_pk], [-_gf_pw/2, -_gf_ph/2 + _gf_pk]]);
}

// One pocket: straight down to the floor, flaring out 45° over the top _gf_c, and
// the recesses for the feet and knuckles below the floor
module _gf_pocket() {
    translate([0, 0, _gf_floor]) linear_extrude(_gf_h - _gf_c - _gf_floor + 0.5) _gf_pocket_outline();
    hull() {
        translate([0, 0, _gf_h - _gf_c]) linear_extrude(0.001) _gf_pocket_outline();
        translate([0, 0, _gf_h + 1 - 0.001]) linear_extrude(0.001) _gf_pocket_outline(_gf_c + 1);
    }
    for (r = _gf_recesses)
        translate([r[0], r[2], _gf_floor - _gf_recess]) cube([r[1] - r[0], r[3] - r[2], _gf_recess + 0.5]);
}

// ----------------------
// Easy open
// ----------------------
// None of this touches the snaps, so the lid holds exactly as before.

// Pry notch (base): an arc cut through the middle of the top of the front tab, so the lid's
// flat front edge shows above it for a fingertip (or a twisted coin) to push up
// on. Towards the front the arc grows into a flare: the sides open out at 45°,
// the bottom by _notch_b, which is a hull of the arc and a bigger one whose centre
// is raised to suit. It faces up and out, so it prints as is.
module _pry_notch(d) {
    yi = d/2 - base_t - 0.5; yc = d/2 - _notch_c; L = _notch_c + 1;
    rise = L * (1 - _notch_b / _notch_c);
    translate([0, 0, base_h - _notch_h + _notch_r]) rotate([-90, 0, 0]) {
        translate([0, 0, yi]) cylinder(r = _notch_r, h = yc - yi, $fn = max($fn, 128));
        hull() {
            translate([0, 0, yc]) cylinder(r = _notch_r, h = 0.001, $fn = max($fn, 128));
            translate([0, -rise, yc + L - 0.001]) cylinder(r = _notch_r + L, h = 0.001, $fn = max($fn, 128));
        }
    }
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
// Finger scoops
// ----------------------
// A quarter-round ramp in the corner between the floor and a compartment's front
// wall, tangent to both. Its curve faces up and back, so it prints as is. Kept
// inside the cavity, so it follows the shell's chamfered corners. The arc is a big
// part of the scoop, so it gets 4x the usual segments (and the STEP check's
// fine reference render gets close enough to the exact arc).
module generate_scoops() {
    intersection() {
        union() for (s = _scoops) {
            x0 = s[0]; x1 = s[1]; y = s[2]; r = s[3];
            difference() {
                translate([x0, y - r, 0]) cube([x1 - x0, r, 0.1 + r]);
                translate([x0 - 1, y - r, 0.1 + r]) rotate([0, 90, 0])
                    cylinder(r = r, h = x1 - x0 + 2, $fn = 4*$fn);
            }
        }
        _base_cavity_in_grid();
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
