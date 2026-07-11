use crate::models::{
    BookletImpositionMode, PresentationBookletRequest, PresentationBookletResponse,
};
use lopdf::content::{Content, Operation};
use lopdf::{dictionary, Dictionary, Document, Object, ObjectId, Stream};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

const MM_TO_PT: f32 = 72.0 / 25.4;

pub fn create_presentation_booklet(
    request: &PresentationBookletRequest,
    output_dir: &Path,
) -> Result<PresentationBookletResponse, String> {
    let mut document = Document::load(&request.pdf_path)
        .map_err(|error| format!("Could not read PDF: {error}"))?;
    let source_pages: Vec<ObjectId> = document.get_pages().into_values().collect();
    if source_pages.is_empty() {
        return Err("The PDF has no pages.".to_string());
    }

    let (sheet_width, sheet_height) =
        sheet_dimensions(request.sheet_width_mm, request.sheet_height_mm);
    let imposed = imposed_sides(source_pages.len(), request.mode);

    let forms = source_pages
        .iter()
        .map(|page_id| page_to_form(&mut document, *page_id))
        .collect::<Result<Vec<_>, _>>()?;

    let pages_id = document.new_object_id();
    let mut page_ids = Vec::with_capacity(imposed.len());
    let imposed_page_count = imposed.len();
    for (output_index, side) in imposed.into_iter().enumerate() {
        let page_id = document.new_object_id();
        let mut xobjects = Dictionary::new();
        let mut operations = Vec::new();
        if let Some(source_page) = side.left {
            add_source_page(
                &forms,
                source_page,
                0.0,
                sheet_width / 2.0,
                sheet_height,
                &mut xobjects,
                &mut operations,
            )?;
        }
        if let Some(source_page) = side.right {
            add_source_page(
                &forms,
                source_page,
                sheet_width / 2.0,
                sheet_width / 2.0,
                sheet_height,
                &mut xobjects,
                &mut operations,
            )?;
        }
        if is_center_sheet_side(output_index, imposed_page_count) {
            add_pin_guides(
                request.pin_guide_count,
                sheet_width,
                sheet_height,
                &mut operations,
            );
        }

        let content = Content { operations }
            .encode()
            .map_err(|error| format!("Could not encode booklet page: {error}"))?;
        let content_id = document.add_object(Stream::new(dictionary! {}, content));
        let resources_id = document.add_object(dictionary! {
            "XObject" => Object::Dictionary(xobjects),
        });
        document.objects.insert(
            page_id,
            Object::Dictionary(dictionary! {
                "Type" => "Page",
                "Parent" => pages_id,
                "MediaBox" => vec![0.into(), 0.into(), sheet_width.into(), sheet_height.into()],
                "Resources" => resources_id,
                "Contents" => content_id,
            }),
        );
        page_ids.push(page_id);
    }

    document.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => page_ids.iter().copied().map(Object::Reference).collect::<Vec<_>>(),
            "Count" => page_ids.len() as i64,
        }),
    );
    let catalog_id = document.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    document.trailer.set("Root", catalog_id);
    document.renumber_objects();
    document.compress();

    let output_path = output_path(request, output_dir);
    document
        .save(&output_path)
        .map_err(|error| format!("Could not save presentation booklet: {error}"))?;

    Ok(PresentationBookletResponse {
        path: output_path.to_string_lossy().to_string(),
        sheet_side_count: page_ids.len(),
        source_page_count: source_pages.len(),
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ImposedSide {
    left: Option<usize>,
    right: Option<usize>,
}

fn imposed_sides(source_count: usize, mode: BookletImpositionMode) -> Vec<ImposedSide> {
    match mode {
        BookletImpositionMode::Presentation => presentation_imposed_sides(source_count),
        BookletImpositionMode::Normal => normal_imposed_sides(source_count),
    }
}

fn presentation_imposed_sides(source_count: usize) -> Vec<ImposedSide> {
    let sheet_count = source_count.div_ceil(2);
    let mut pages = Vec::with_capacity(sheet_count * 2);
    for sheet in 0..sheet_count {
        let front = sheet + 1;
        let back = source_count - sheet;
        pages.push(ImposedSide {
            left: None,
            right: Some(front),
        });
        pages.push(ImposedSide {
            left: None,
            right: (back > front).then_some(back),
        });
    }
    pages
}

fn normal_imposed_sides(source_count: usize) -> Vec<ImposedSide> {
    let padded_count = source_count.next_multiple_of(4);
    let sheet_count = padded_count / 4;
    let mut pages = Vec::with_capacity(sheet_count * 2);
    for sheet in 0..sheet_count {
        let front_left = padded_count - 2 * sheet;
        let front_right = 1 + 2 * sheet;
        let back_left = 2 + 2 * sheet;
        let back_right = padded_count - 1 - 2 * sheet;
        pages.push(ImposedSide {
            left: real_page(front_left, source_count),
            right: real_page(front_right, source_count),
        });
        pages.push(ImposedSide {
            left: real_page(back_left, source_count),
            right: real_page(back_right, source_count),
        });
    }
    pages
}

fn real_page(page: usize, source_count: usize) -> Option<usize> {
    (page <= source_count).then_some(page)
}

fn sheet_dimensions(width_mm: f32, height_mm: f32) -> (f32, f32) {
    (
        width_mm.max(height_mm) * MM_TO_PT,
        width_mm.min(height_mm) * MM_TO_PT,
    )
}

fn is_center_sheet_side(output_index: usize, imposed_page_count: usize) -> bool {
    imposed_page_count >= 2 && output_index >= imposed_page_count - 2
}

fn page_to_form(
    document: &mut Document,
    page_id: ObjectId,
) -> Result<(ObjectId, f32, f32), String> {
    document
        .get_object(page_id)
        .and_then(Object::as_dict)
        .map_err(|error| format!("Could not read PDF page: {error}"))?;
    let media_box = inherited_array(document, page_id, b"MediaBox")?;
    let (x0, y0, x1, y1) = box_coordinates(&media_box)?;
    let width = (x1 - x0).abs();
    let height = (y1 - y0).abs();
    if width <= 0.0 || height <= 0.0 {
        return Err("PDF page has invalid dimensions.".to_string());
    }

    let resources = inherited_object(document, page_id, b"Resources")
        .unwrap_or_else(|| Object::Dictionary(Dictionary::new()));
    let contents = document
        .get_page_content(page_id)
        .map_err(|error| format!("Could not read PDF page content: {error}"))?;
    let stream = Stream::new(
        dictionary! {
            "Type" => "XObject",
            "Subtype" => "Form",
            "FormType" => 1,
            "BBox" => vec![x0.into(), y0.into(), x1.into(), y1.into()],
            "Resources" => resources,
            "Matrix" => vec![1.into(), 0.into(), 0.into(), 1.into(), (-x0).into(), (-y0).into()],
        },
        contents,
    );
    let form_id = document.add_object(stream);
    Ok((form_id, width, height))
}

fn add_source_page(
    forms: &[(ObjectId, f32, f32)],
    source_page: usize,
    half_x: f32,
    half_width: f32,
    sheet_height: f32,
    xobjects: &mut Dictionary,
    operations: &mut Vec<Operation>,
) -> Result<(), String> {
    let source_index = source_page - 1;
    let (form_id, source_width, source_height) = forms[source_index];
    let transform = source_placement_transform(
        source_width,
        source_height,
        half_x,
        half_width,
        sheet_height,
    );
    let name = format!("Slide{}", source_index + 1);
    xobjects.set(name.as_bytes(), form_id);
    operations.extend([
        Operation::new("q", vec![]),
        Operation::new("cm", transform.into_iter().map(Object::Real).collect()),
        Operation::new("Do", vec![Object::Name(name.into_bytes())]),
        Operation::new("Q", vec![]),
    ]);
    Ok(())
}

fn source_placement_transform(
    source_width: f32,
    source_height: f32,
    half_x: f32,
    half_width: f32,
    sheet_height: f32,
) -> [f32; 6] {
    let (safe_x, safe_y, safe_width, safe_height) =
        source_safe_rectangle(half_x, half_width, sheet_height);
    let scale = (safe_width / source_height).min(safe_height / source_width);
    let placed_width = source_height * scale;
    let placed_height = source_width * scale;
    let x = safe_x + (safe_width - placed_width) / 2.0;
    let y = safe_y + (safe_height - placed_height) / 2.0;

    // CUPS rotates the landscape imposed sheet -90 degrees for portrait-fed
    // media. Pre-rotating source content +90 degrees gives an upright net result.
    [0.0, scale, -scale, 0.0, x + placed_width, y]
}

fn source_safe_rectangle(half_x: f32, half_width: f32, sheet_height: f32) -> (f32, f32, f32, f32) {
    let horizontal_inset = half_width * 0.03;
    let vertical_inset = sheet_height * 0.03;
    (
        half_x + horizontal_inset,
        vertical_inset,
        half_width - horizontal_inset * 2.0,
        sheet_height - vertical_inset * 2.0,
    )
}

fn add_pin_guides(count: u8, width: f32, height: f32, operations: &mut Vec<Operation>) {
    if count == 0 {
        return;
    }
    operations.extend([
        Operation::new("q", vec![]),
        Operation::new("G", vec![0.72.into()]),
        Operation::new("w", vec![(height * 0.0007).clamp(0.35, 0.8).into()]),
    ]);
    for (x1, y1, x2, y2) in pin_guide_segments(count, width, height) {
        operations.extend([
            Operation::new("m", vec![x1.into(), y1.into()]),
            Operation::new("l", vec![x2.into(), y2.into()]),
            Operation::new("S", vec![]),
        ]);
    }
    operations.push(Operation::new("Q", vec![]));
}

fn pin_guide_segments(count: u8, width: f32, height: f32) -> Vec<(f32, f32, f32, f32)> {
    if count == 0 {
        return Vec::new();
    }
    let fold_x = width / 2.0;
    let mark_half_length = (height * 0.012).clamp(5.0, 14.0);
    let safe_margin = height * 0.12 + mark_half_length;
    (0..count)
        .map(|index| {
            let y = if count == 1 {
                height / 2.0
            } else {
                safe_margin
                    + (height - safe_margin * 2.0) * index as f32 / (count.saturating_sub(1)) as f32
            };
            (fold_x, y - mark_half_length, fold_x, y + mark_half_length)
        })
        .collect()
}

fn inherited_array(
    document: &Document,
    page_id: ObjectId,
    key: &[u8],
) -> Result<Vec<Object>, String> {
    inherited_object(document, page_id, key)
        .ok_or_else(|| format!("PDF page is missing {}.", String::from_utf8_lossy(key)))?
        .as_array()
        .cloned()
        .map_err(|_| format!("PDF page has invalid {}.", String::from_utf8_lossy(key)))
}

fn inherited_object(document: &Document, mut object_id: ObjectId, key: &[u8]) -> Option<Object> {
    loop {
        let dictionary = document.get_object(object_id).ok()?.as_dict().ok()?;
        if let Ok(value) = dictionary.get(key) {
            return Some(value.clone());
        }
        object_id = dictionary.get(b"Parent").ok()?.as_reference().ok()?;
    }
}

fn box_coordinates(media_box: &[Object]) -> Result<(f32, f32, f32, f32), String> {
    if media_box.len() != 4 {
        return Err("PDF page has invalid MediaBox.".to_string());
    }
    Ok((
        number(&media_box[0])?,
        number(&media_box[1])?,
        number(&media_box[2])?,
        number(&media_box[3])?,
    ))
}

fn number(value: &Object) -> Result<f32, String> {
    match value {
        Object::Integer(value) => Ok(*value as f32),
        Object::Real(value) => Ok(*value),
        _ => Err("PDF page dimensions are invalid.".to_string()),
    }
}

fn output_path(request: &PresentationBookletRequest, output_dir: &Path) -> PathBuf {
    let mut hasher = Sha256::new();
    hasher.update(request.pdf_path.as_bytes());
    if let Ok(metadata) = fs::metadata(&request.pdf_path) {
        hasher.update(metadata.len().to_le_bytes());
        if let Ok(modified) = metadata.modified() {
            if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                hasher.update(duration.as_nanos().to_le_bytes());
            }
        }
    }
    hasher.update(request.sheet_width_mm.to_le_bytes());
    hasher.update(request.sheet_height_mm.to_le_bytes());
    hasher.update([request.pin_guide_count]);
    hasher.update(format!("{:?}", request.mode).as_bytes());
    output_dir.join(format!(
        "presentation-{}.pdf",
        hex::encode(&hasher.finalize()[..12])
    ))
}

#[cfg(test)]
mod tests {
    use crate::models::BookletImpositionMode;

    use super::{
        imposed_sides, is_center_sheet_side, normal_imposed_sides, pin_guide_segments,
        presentation_imposed_sides, sheet_dimensions, source_placement_transform,
        source_safe_rectangle, ImposedSide,
    };

    #[test]
    fn six_slides_are_paired_front_low_back_high() {
        assert_eq!(
            presentation_imposed_sides(6),
            vec![
                side(None, Some(1)),
                side(None, Some(6)),
                side(None, Some(2)),
                side(None, Some(5)),
                side(None, Some(3)),
                side(None, Some(4)),
            ]
        );
    }

    #[test]
    fn odd_slide_count_has_a_blank_final_back() {
        assert_eq!(
            presentation_imposed_sides(5),
            vec![
                side(None, Some(1)),
                side(None, Some(5)),
                side(None, Some(2)),
                side(None, Some(4)),
                side(None, Some(3)),
                side(None, None),
            ]
        );
    }

    #[test]
    fn ten_slides_preserve_exact_physical_sheet_order() {
        assert_eq!(
            presentation_imposed_sides(10),
            vec![
                side(None, Some(1)),
                side(None, Some(10)),
                side(None, Some(2)),
                side(None, Some(9)),
                side(None, Some(3)),
                side(None, Some(8)),
                side(None, Some(4)),
                side(None, Some(7)),
                side(None, Some(5)),
                side(None, Some(6)),
            ]
        );
    }

    #[test]
    fn normal_booklet_six_pages_pad_to_eight() {
        assert_eq!(
            normal_imposed_sides(6),
            vec![
                side(None, Some(1)),
                side(Some(2), None),
                side(Some(6), Some(3)),
                side(Some(4), Some(5)),
            ]
        );
    }

    #[test]
    fn normal_booklet_twenty_four_pages_use_both_halves() {
        assert_eq!(
            normal_imposed_sides(24),
            vec![
                side(Some(24), Some(1)),
                side(Some(2), Some(23)),
                side(Some(22), Some(3)),
                side(Some(4), Some(21)),
                side(Some(20), Some(5)),
                side(Some(6), Some(19)),
                side(Some(18), Some(7)),
                side(Some(8), Some(17)),
                side(Some(16), Some(9)),
                side(Some(10), Some(15)),
                side(Some(14), Some(11)),
                side(Some(12), Some(13)),
            ]
        );
    }

    #[test]
    fn normal_booklet_odd_count_pads_to_multiple_of_four() {
        assert_eq!(
            normal_imposed_sides(5),
            vec![
                side(None, Some(1)),
                side(Some(2), None),
                side(None, Some(3)),
                side(Some(4), Some(5)),
            ]
        );
    }

    #[test]
    fn mode_dispatch_preserves_presentation_and_normal_orders() {
        assert_eq!(
            imposed_sides(6, BookletImpositionMode::Presentation),
            presentation_imposed_sides(6)
        );
        assert_eq!(
            imposed_sides(6, BookletImpositionMode::Normal),
            normal_imposed_sides(6)
        );
    }

    #[test]
    fn normal_booklet_places_content_in_both_halves() {
        let side = normal_imposed_sides(4)[0];
        assert!(side.left.is_some());
        assert!(side.right.is_some());
    }

    #[test]
    fn output_media_box_is_landscape_for_a4_and_a3() {
        let (a4_width, a4_height) = sheet_dimensions(210.0, 297.0);
        assert!((a4_width - 841.8898).abs() < 0.01);
        assert!((a4_height - 595.2756).abs() < 0.01);
        assert!(a4_width > a4_height);

        let (a3_width, a3_height) = sheet_dimensions(297.0, 420.0);
        assert!((a3_width - 1190.5513).abs() < 0.01);
        assert!((a3_height - 841.8898).abs() < 0.01);
        assert!(a3_width > a3_height);
    }

    #[test]
    fn guides_are_only_on_both_sides_of_the_center_sheet() {
        for imposed_page_count in [6, 10] {
            for output_index in 0..imposed_page_count {
                assert_eq!(
                    is_center_sheet_side(output_index, imposed_page_count),
                    output_index >= imposed_page_count - 2
                );
            }
        }
    }

    #[test]
    fn pin_guide_segments_are_vertical_and_centered_on_fold() {
        let width = 842.0;
        let segments = pin_guide_segments(4, width, 595.0);
        assert_eq!(segments.len(), 4);
        for (x1, y1, x2, y2) in segments {
            assert_eq!(x1, width / 2.0);
            assert_eq!(x2, width / 2.0);
            assert!(y2 > y1);
        }
    }

    #[test]
    fn source_rotation_cancels_cups_negative_ninety_degree_rotation() {
        let [a, b, c, d, _, _] = source_placement_transform(842.0, 595.0, 421.0, 421.0, 595.0);
        assert_eq!(a, 0.0);
        assert!(b > 0.0);
        assert!(c < 0.0);
        assert_eq!(d, 0.0);

        // CUPS -90 maps (x, y) to (y, -x). Both source basis vectors
        // therefore return upright after our +90 transform.
        let transformed_x = (a, b);
        let transformed_y = (c, d);
        let printed_x = (transformed_x.1, -transformed_x.0);
        let printed_y = (transformed_y.1, -transformed_y.0);
        assert!(printed_x.0 > 0.0 && printed_x.1 == 0.0);
        assert!(printed_y.0 == 0.0 && printed_y.1 > 0.0);
    }

    #[test]
    fn transformed_source_corners_stay_inside_a4_and_a3_safe_rectangles() {
        let source_width = 842.0;
        let source_height = 595.0;
        for (sheet_width, sheet_height) in [(841.8898, 595.2756), (1190.5513, 841.8898)] {
            let half_width = sheet_width / 2.0;
            let half_x = half_width;
            let transform = source_placement_transform(
                source_width,
                source_height,
                half_x,
                half_width,
                sheet_height,
            );
            let (safe_x, safe_y, safe_width, safe_height) =
                source_safe_rectangle(half_x, half_width, sheet_height);
            let [a, b, c, d, e, f] = transform;

            for (source_x, source_y) in [
                (0.0, 0.0),
                (source_width, 0.0),
                (0.0, source_height),
                (source_width, source_height),
            ] {
                let x = a * source_x + c * source_y + e;
                let y = b * source_x + d * source_y + f;
                assert!(x >= safe_x - 0.001);
                assert!(x <= safe_x + safe_width + 0.001);
                assert!(y >= safe_y - 0.001);
                assert!(y <= safe_y + safe_height + 0.001);
            }
        }
    }

    fn side(left: Option<usize>, right: Option<usize>) -> ImposedSide {
        ImposedSide { left, right }
    }
}
