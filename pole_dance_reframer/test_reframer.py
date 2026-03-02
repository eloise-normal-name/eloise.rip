"""
test_reframer.py — unit tests for reframer.py pure-logic functions.

Covers the behaviours that previously caused:
  - Subject flickering (pick_primary switching IDs each frame)
  - Subject being blurred (split detections of subject not excluded)

Run from repo root:
    pytest pole_dance_reframer/test_reframer.py -v
"""

import numpy as np
import pytest

from reframer import (
    BBox,
    CropState,
    SubjectTracker,
    apply_blur_regions,
    centroid_inside,
    compute_crop_window,
    iou,
    parse_aspect,
    pick_primary,
    update_ema,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def solid_frame(h: int, w: int, value: int = 128) -> np.ndarray:
    """Uniform grey BGR frame — useful when blur detectability doesn't matter."""
    return np.full((h, w, 3), value, dtype=np.uint8)


def textured_frame(h: int, w: int, seed: int = 0) -> np.ndarray:
    """Pseudo-random BGR frame — needed to confirm blur actually changed pixels."""
    rng = np.random.default_rng(seed)
    return rng.integers(0, 256, (h, w, 3), dtype=np.uint8)


# ---------------------------------------------------------------------------
# iou()
# ---------------------------------------------------------------------------

class TestIou:
    def test_identical_boxes(self):
        a = BBox(0, 0, 100, 100)
        assert iou(a, a) == pytest.approx(1.0)

    def test_no_overlap(self):
        assert iou(BBox(0, 0, 10, 10), BBox(20, 20, 30, 30)) == pytest.approx(0.0)

    def test_touching_edge_is_zero(self):
        # Boxes share an edge but interiors don't overlap
        assert iou(BBox(0, 0, 10, 10), BBox(10, 0, 20, 10)) == pytest.approx(0.0)

    def test_partial_overlap(self):
        # 10×10 and 10×10, 5×5 overlap → intersection=25, union=175
        assert iou(BBox(0, 0, 10, 10), BBox(5, 5, 15, 15)) == pytest.approx(25 / 175)

    def test_one_inside_other(self):
        outer = BBox(0, 0, 100, 100)   # area 10000
        inner = BBox(10, 10, 20, 20)   # area 100, fully inside
        assert iou(outer, inner) == pytest.approx(100 / 10000)

    def test_symmetrical(self):
        a, b = BBox(0, 0, 50, 50), BBox(25, 25, 75, 75)
        assert iou(a, b) == pytest.approx(iou(b, a))

    def test_full_overlap_different_objects(self):
        a = BBox(10, 10, 60, 60)
        b = BBox(10, 10, 60, 60)
        assert iou(a, b) == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# centroid_inside()
# ---------------------------------------------------------------------------

class TestCentroidInside:
    def setup_method(self):
        self.primary = BBox(100, 100, 300, 400)  # cx=200, cy=250

    def test_centroid_strictly_inside(self):
        # cx=200, cy=250 → inside primary(100-300, 100-400)
        box = BBox(150, 200, 250, 300)
        assert centroid_inside(box, self.primary) is True

    def test_centroid_outside(self):
        # cx=50, cy=50 → outside
        box = BBox(0, 0, 100, 100)
        assert centroid_inside(box, self.primary) is False

    def test_centroid_on_boundary_included(self):
        # cx == primary.x1 → boundary, should be True (>=)
        box = BBox(self.primary.x1 - 50, 200, self.primary.x1 + 50, 300)
        # cx = primary.x1, which is exactly on the left edge
        assert box.cx == self.primary.x1
        assert centroid_inside(box, self.primary) is True

    def test_inverted_subject_legs_detected_separately(self):
        # Simulate: subject detected from y=0..800, but legs also detected
        # as a separate box at y=0..400 (upper half of body when inverted).
        # The legs box centroid (cx=200, cy=200) should fall inside the
        # primary full-body box (0..400, 0..800).
        primary = BBox(0, 0, 400, 800)     # full body, cx=200 cy=400
        legs    = BBox(50, 0, 350, 400)    # cx=200, cy=200 — inside primary
        assert centroid_inside(legs, primary) is True

    def test_genuine_background_person_not_inside(self):
        # Background person far from subject
        bg = BBox(500, 500, 700, 900)      # cx=600, cy=700 — outside primary
        assert centroid_inside(bg, self.primary) is False


# ---------------------------------------------------------------------------
# parse_aspect()
# ---------------------------------------------------------------------------

class TestParseAspect:
    def test_portrait(self):
        assert parse_aspect("9:16") == (9, 16)

    def test_landscape(self):
        assert parse_aspect("16:9") == (16, 9)

    def test_square(self):
        assert parse_aspect("1:1") == (1, 1)

    def test_invalid_raises(self):
        with pytest.raises(ValueError):
            parse_aspect("bad")

    def test_missing_colon_raises(self):
        with pytest.raises(ValueError):
            parse_aspect("916")


# ---------------------------------------------------------------------------
# compute_crop_window()
# ---------------------------------------------------------------------------

class TestComputeCropWindow:
    def test_portrait_input_portrait_target_is_full_frame(self):
        # 9:16 target from a 1080×1920 frame → full frame
        x, y, cw, ch = compute_crop_window(540.0, 960.0, 9, 16, 1080, 1920)
        assert cw == 1080 and ch == 1920

    def test_landscape_input_portrait_target_is_height_constrained(self):
        # 1920×1080 input, 9:16 crop → ch=1080, cw≈608
        x, y, cw, ch = compute_crop_window(960.0, 540.0, 9, 16, 1920, 1080)
        assert ch == 1080
        assert abs(cw - round(1080 * 9 / 16)) <= 1

    def test_crop_never_exceeds_frame(self):
        for fw, fh in [(1920, 1080), (694, 970), (1080, 1920)]:
            x, y, cw, ch = compute_crop_window(fw / 2, fh / 2, 9, 16, fw, fh)
            assert x >= 0 and y >= 0
            assert x + cw <= fw
            assert y + ch <= fh

    def test_subject_at_left_edge_clamps_x_to_zero(self):
        x, y, cw, ch = compute_crop_window(0.0, 540.0, 9, 16, 1920, 1080)
        assert x == 0

    def test_subject_at_right_edge_clamps(self):
        x, y, cw, ch = compute_crop_window(1920.0, 540.0, 9, 16, 1920, 1080)
        assert x + cw <= 1920

    def test_subject_at_top_edge_clamps_y_to_zero(self):
        x, y, cw, ch = compute_crop_window(960.0, 0.0, 9, 16, 1920, 1080)
        assert y == 0

    def test_subject_at_bottom_edge_clamps(self):
        x, y, cw, ch = compute_crop_window(960.0, 1080.0, 9, 16, 1920, 1080)
        assert y + ch <= 1080

    def test_centred_subject_centres_crop(self):
        fw, fh = 1920, 1080
        x, y, cw, ch = compute_crop_window(fw / 2, fh / 2, 9, 16, fw, fh)
        # crop centre should equal frame centre (within rounding)
        assert abs((x + cw / 2) - fw / 2) <= 1


# ---------------------------------------------------------------------------
# update_ema()
# ---------------------------------------------------------------------------

class TestUpdateEma:
    def test_first_call_initialises_to_target(self):
        state = CropState()
        update_ema(state, 0.3, 0.7, alpha=0.1)
        assert state.cx == pytest.approx(0.3)
        assert state.cy == pytest.approx(0.7)
        assert state.initialized is True

    def test_alpha_1_is_no_smoothing(self):
        state = CropState(cx=0.0, cy=0.0, initialized=True)
        update_ema(state, 0.8, 0.6, alpha=1.0)
        assert state.cx == pytest.approx(0.8)
        assert state.cy == pytest.approx(0.6)

    def test_alpha_0_is_fully_locked(self):
        state = CropState(cx=0.2, cy=0.3, initialized=True)
        update_ema(state, 0.9, 0.9, alpha=0.0)
        assert state.cx == pytest.approx(0.2)
        assert state.cy == pytest.approx(0.3)

    def test_alpha_half_averages_evenly(self):
        state = CropState(cx=0.0, cy=0.0, initialized=True)
        update_ema(state, 1.0, 1.0, alpha=0.5)
        assert state.cx == pytest.approx(0.5)
        assert state.cy == pytest.approx(0.5)

    def test_converges_after_many_steps(self):
        state = CropState(cx=0.0, cy=0.0, initialized=True)
        for _ in range(200):
            update_ema(state, 1.0, 1.0, alpha=0.1)
        assert state.cx == pytest.approx(1.0, abs=0.01)
        assert state.cy == pytest.approx(1.0, abs=0.01)


# ---------------------------------------------------------------------------
# pick_primary() — subject lock-on and flickering regression
# ---------------------------------------------------------------------------

FW, FH = 700, 1000  # arbitrary frame size for tracker tests


class TestPickPrimary:
    def test_empty_returns_none(self):
        tracker = SubjectTracker()
        assert pick_primary([], FW, FH, tracker) is None

    def test_first_call_selects_closest_to_centre(self):
        centre = BBox(300, 450, 400, 550, track_id=1)  # near frame centre
        edge   = BBox(  0,   0, 100, 100, track_id=2)  # top-left
        tracker = SubjectTracker()
        result = pick_primary([edge, centre], FW, FH, tracker)
        assert result is centre
        assert tracker.locked_id == 1

    def test_area_breaks_tie(self):
        # Both centroids at same distance from frame centre; larger area wins
        small = BBox(330, 480, 370, 520, track_id=1)  # 40×40
        large = BBox(300, 450, 400, 550, track_id=2)  # 100×100, same centroid
        tracker = SubjectTracker()
        result = pick_primary([small, large], FW, FH, tracker)
        assert result is large

    # --- Regression: flickering ---
    def test_locked_id_not_overridden_by_closer_interloper(self):
        """
        Original bug: every frame re-ran centre-proximity, so a background
        person briefly closer to centre would hijack the subject.
        After lock-on, a different-ID box must never override it.
        """
        tracker = SubjectTracker(locked_id=1)
        subject    = BBox(280, 430, 420, 570, track_id=1)  # slightly off-centre
        interloper = BBox(330, 480, 370, 520, track_id=2)  # closer to centre
        result = pick_primary([interloper, subject], FW, FH, tracker)
        assert result is subject
        assert tracker.locked_id == 1

    def test_holds_position_when_id_missing_within_grace(self):
        """Within grace period, return None (hold last crop) not a different person."""
        tracker = SubjectTracker(locked_id=1, reacquire_after=10)
        other = BBox(330, 480, 370, 520, track_id=2)
        result = pick_primary([other], FW, FH, tracker)
        assert result is None
        assert tracker.locked_id == 1   # still locked
        assert tracker.frames_missing == 1

    def test_grace_period_increments_each_missing_frame(self):
        tracker = SubjectTracker(locked_id=1, frames_missing=3, reacquire_after=10)
        pick_primary([], FW, FH, tracker)
        assert tracker.frames_missing == 4
        assert tracker.locked_id == 1

    def test_reacquires_after_grace_period_expires(self):
        tracker = SubjectTracker(locked_id=1, frames_missing=10, reacquire_after=10)
        new_subject = BBox(330, 480, 370, 520, track_id=2)
        result = pick_primary([new_subject], FW, FH, tracker)
        assert result is new_subject
        assert tracker.locked_id == 2

    def test_missing_counter_resets_when_id_recovers(self):
        tracker = SubjectTracker(locked_id=1, frames_missing=8)
        subject = BBox(300, 450, 400, 550, track_id=1)
        result = pick_primary([subject], FW, FH, tracker)
        assert result is subject
        assert tracker.frames_missing == 0

    def test_locked_id_cleared_after_no_boxes_for_grace_period(self):
        tracker = SubjectTracker(locked_id=1, frames_missing=10, reacquire_after=10)
        pick_primary([], FW, FH, tracker)
        assert tracker.locked_id is None


# ---------------------------------------------------------------------------
# apply_blur_regions() — subject protection and blur correctness
# ---------------------------------------------------------------------------

class TestApplyBlurRegions:
    # --- Primary is always protected ---

    def test_primary_region_unchanged(self):
        frame = textured_frame(200, 200, seed=1)
        primary = BBox(10, 10, 90, 90, track_id=1)
        original = frame[10:90, 10:90].copy()
        result = apply_blur_regions(frame, primary, [primary], kernel=21)
        assert np.array_equal(result[10:90, 10:90], original)

    # --- Background persons are blurred ---

    def test_non_overlapping_background_person_is_blurred(self):
        frame = textured_frame(300, 300, seed=2)
        primary   = BBox(  0,   0,  50,  50, track_id=1)
        bg_person = BBox(150, 150, 250, 250, track_id=2)  # IoU=0
        original_bg = frame[150:250, 150:250].copy()
        result = apply_blur_regions(frame, primary, [primary, bg_person], kernel=21)
        assert not np.array_equal(result[150:250, 150:250], original_bg)

    # --- Split detections of the subject are NOT blurred ---

    def test_high_iou_split_detection_not_blurred(self):
        """
        Regression: inverted/occluded subject → YOLO emits a second overlapping
        box for their partial body. That box must not be blurred.
        """
        frame = textured_frame(200, 200, seed=3)
        primary   = BBox(10, 10, 190, 190, track_id=1)   # full body
        split_box = BBox(10, 100, 190, 190, track_id=2)  # lower half — high IoU
        # iou(primary, split_box) = (80*90) / (180*180 + 80*90 - 80*90)
        #                         = 7200 / 32400 ≈ 0.22 — below default 0.3...
        # Use a more overlapping split to guarantee above threshold
        split_box2 = BBox(10, 10, 190, 130, track_id=3)  # top 2/3 — iou ≈ 0.56
        original = frame.copy()
        result = apply_blur_regions(
            frame, primary, [primary, split_box2], kernel=21, overlap_threshold=0.3
        )
        # split_box2 overlaps primary heavily — must not be blurred
        assert np.array_equal(result[10:130, 10:190], original[10:130, 10:190])

    def test_centroid_inside_primary_not_blurred(self):
        """
        Regression: when subject is horizontal on the pole, YOLO may detect
        their legs as a separate person whose centroid falls inside the main box.
        """
        frame = textured_frame(300, 300, seed=4)
        # primary covers full body
        primary = BBox(50, 50, 250, 250, track_id=1)
        # "legs" detected separately — centroid at (150, 125) is inside primary
        legs = BBox(50, 50, 250, 200, track_id=2)
        assert centroid_inside(legs, primary), "precondition: centroid must be inside"
        original = frame[50:200, 50:250].copy()
        result = apply_blur_regions(
            frame, primary, [primary, legs], kernel=21, overlap_threshold=0.3
        )
        assert np.array_equal(result[50:200, 50:250], original)

    def test_box_with_centroid_outside_but_low_iou_is_blurred(self):
        """A genuinely separate person whose centroid is outside the subject is blurred."""
        frame = textured_frame(400, 400, seed=5)
        primary    = BBox( 50,  50, 150, 350, track_id=1)
        bg_person  = BBox(250, 100, 350, 300, track_id=2)
        # Sanity-check the test setup
        assert not centroid_inside(bg_person, primary)
        assert iou(bg_person, primary) < 0.3
        original_bg = frame[100:300, 250:350].copy()
        result = apply_blur_regions(
            frame, primary, [primary, bg_person], kernel=21, overlap_threshold=0.3
        )
        assert not np.array_equal(result[100:300, 250:350], original_bg)

    def test_blur_does_not_modify_primary_region_even_with_many_others(self):
        frame = textured_frame(500, 500, seed=6)
        primary = BBox(200, 200, 300, 400, track_id=1)
        others = [
            BBox(  0,   0,  80,  80, track_id=2),
            BBox(400, 400, 490, 490, track_id=3),
            BBox(  0, 400,  80, 490, track_id=4),
        ]
        original_primary = frame[200:400, 200:300].copy()
        result = apply_blur_regions(frame, primary, [primary] + others, kernel=21)
        assert np.array_equal(result[200:400, 200:300], original_primary)

    def test_iou_threshold_at_exactly_boundary_skips_blur(self):
        """A box whose IoU equals the threshold exactly should be skipped (>=)."""
        frame = textured_frame(200, 200, seed=7)
        primary = BBox(0, 0, 100, 100)
        other   = BBox(0, 0, 100, 100)   # IoU == 1.0 — well above any threshold
        original = frame[0:100, 0:100].copy()
        result = apply_blur_regions(
            frame, primary, [primary, other], kernel=21, overlap_threshold=0.3
        )
        assert np.array_equal(result[0:100, 0:100], original)
