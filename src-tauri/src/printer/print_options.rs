use crate::parser::DriverOptions;

pub fn build_print_options(
    settings: &crate::models::PrintSettings,
    options: &DriverOptions,
) -> Vec<String> {
    let mut args = Vec::new();
    let is_presentation_booklet = settings.duplex == "PresentationBooklet";

    if let Some(option) = option_value(
        options,
        &["PageSize", "media", "MediaSize"],
        &settings.paper_size,
    ) {
        args.push(format!("media={option}"));
    } else {
        args.push(format!("media={}", settings.paper_size));
    }

    args.push(map_duplex(&settings.duplex, options));
    if is_presentation_booklet && supports_exact_option(options, "Binding", "TopBinding") {
        args.push("Binding=TopBinding".to_string());
    }
    args.push(map_quality(&settings.quality, options));

    if let Some((keyword, option)) = option_keyword_value(
        options,
        &["KMInputSlot", "InputSlot", "APInputSlot", "PaperSources"],
        &settings.tray,
    ) {
        args.push(format!("{keyword}={option}"));
    }
    if let Some((keyword, option)) = option_keyword_value(
        options,
        &["SelectColor", "ColorModel", "ColorMode", "BRColorMode"],
        &settings.color_mode,
    ) {
        args.push(format!("{keyword}={option}"));
    }
    if let Some((keyword, option)) = option_keyword_value(
        options,
        &["MediaType", "KMMediaType", "MediaWeight"],
        &settings.paper_weight,
    ) {
        args.push(format!("{keyword}={option}"));
    }

    if !settings.normalized_page_selection.trim().is_empty() {
        args.push(format!("page-ranges={}", settings.normalized_page_selection.trim()));
    }

    match settings.scale_mode.as_str() {
        "fit" => args.push("fit-to-page=true".to_string()),
        "actual" => {
            args.push("fit-to-page=false".to_string());
            args.push("scaling=100".to_string());
        }
        "custom" => {
            let percent = settings.custom_scale_percent.unwrap_or(100).clamp(10, 400);
            args.push(format!("scaling={percent}"));
        }
        _ => {}
    }

    match settings.margin_mode.as_str() {
        "none" => {
            args.extend([
                "page-top=0".to_string(),
                "page-right=0".to_string(),
                "page-bottom=0".to_string(),
                "page-left=0".to_string(),
            ]);
        }
        "custom" => {
            if let Some(margins) = &settings.custom_margins_mm {
                args.push(format!("page-top={}", mm_to_points(margins.top)));
                args.push(format!("page-right={}", mm_to_points(margins.right)));
                args.push(format!("page-bottom={}", mm_to_points(margins.bottom)));
                args.push(format!("page-left={}", mm_to_points(margins.left)));
            }
        }
        _ => {}
    }

    if let Some(position) = cups_position(&settings.align) {
        args.push(format!("position={position}"));
    }

    // Advanced driver options chosen in the "More Options" panel travel straight
    // through as CUPS `-o keyword=value` pairs. Their keywords are disjoint from
    // the typed settings above (the UI only records driver options whose keyword
    // is not one of the normalized capability keywords), so they never conflict.
    for (keyword, value) in &settings.driver_options {
        let keyword = keyword.trim();
        let value = value.trim();
        if keyword.is_empty()
            || value.is_empty()
            || (is_presentation_booklet && keyword == "Binding")
        {
            continue;
        }
        args.push(format!("{keyword}={value}"));
    }

    args
}

fn supports_exact_option(options: &DriverOptions, keyword: &str, value: &str) -> bool {
    options
        .get(keyword)
        .is_some_and(|option| option.choices.iter().any(|choice| choice.value == value))
}

fn mm_to_points(value: f32) -> u16 {
    ((value.clamp(0.0, 50.0) / 25.4) * 72.0).round() as u16
}

fn cups_position(value: &str) -> Option<&'static str> {
    match value {
        "center" => Some("center"),
        "top-left" => Some("top-left"),
        "top-center" => Some("top"),
        "top-right" => Some("top-right"),
        "center-left" => Some("left"),
        "center-right" => Some("right"),
        "bottom-left" => Some("bottom-left"),
        "bottom-center" => Some("bottom"),
        "bottom-right" => Some("bottom-right"),
        _ => None,
    }
}

fn map_duplex(value: &str, options: &DriverOptions) -> String {
    if value == "PresentationBooklet" {
        return "sides=two-sided-short-edge".to_string();
    }

    if let Some((keyword, option)) =
        option_keyword_value(options, &["KMDuplex", "sides", "Duplex", "EFDuplex"], value)
    {
        return format!("{keyword}={option}");
    }

    match value {
        "Double-sided" | "Double" => "sides=two-sided-long-edge".to_string(),
        "Booklet" => "sides=two-sided-short-edge".to_string(),
        _ => "sides=one-sided".to_string(),
    }
}

fn map_quality(value: &str, options: &DriverOptions) -> String {
    if let Some((keyword, option)) = option_keyword_value(
        options,
        &[
            "Resolution",
            "printer-resolution",
            "CNResolution",
            "cupsPrintQuality",
        ],
        value,
    ) {
        return format!("{keyword}={option}");
    }

    match value {
        "High" => "print-quality=4".to_string(),
        "Best" => "print-quality=5".to_string(),
        _ => "print-quality=3".to_string(),
    }
}

fn option_value(options: &DriverOptions, keywords: &[&str], selected: &str) -> Option<String> {
    option_keyword_value(options, keywords, selected).map(|(_, value)| value)
}

fn option_keyword_value(
    options: &DriverOptions,
    keywords: &[&str],
    selected: &str,
) -> Option<(String, String)> {
    for keyword in keywords {
        let Some(option) = options.get(*keyword) else {
            continue;
        };

        let normalized_selected = normalize(selected);
        if let Some(choice) = option.choices.iter().find(|choice| {
            normalize(&choice.value) == normalized_selected
                || normalize(&choice.label) == normalized_selected
        }) {
            return Some((option.keyword.clone(), choice.value.clone()));
        }
    }

    None
}

fn normalize(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::build_print_options;
    use crate::models::{CapabilityChoice, ParsedOption, PrintSettings};
    use crate::parser::DriverOptions;
    use std::collections::HashMap;

    fn base_settings() -> PrintSettings {
        PrintSettings {
            printer_id: "p".to_string(),
            paper_size: "A4".to_string(),
            paper_weight: String::new(),
            tray: String::new(),
            duplex: String::new(),
            copies: 1,
            color_mode: String::new(),
            quality: String::new(),
            normalized_page_selection: String::new(),
            scale_mode: String::new(),
            custom_scale_percent: None,
            margin_mode: String::new(),
            custom_margins_mm: None,
            align: String::new(),
            driver_options: HashMap::new(),
        }
    }

    #[test]
    fn forwards_driver_options_as_cups_args() {
        let mut settings = base_settings();
        settings
            .driver_options
            .insert("Orientation".to_string(), "Landscape".to_string());
        settings
            .driver_options
            .insert("StapleLocation".to_string(), "SinglePortrait".to_string());
        // Blank values must be skipped, never emitted as `keyword=`.
        settings
            .driver_options
            .insert("Ignored".to_string(), "   ".to_string());

        let args = build_print_options(&settings, &DriverOptions::new());

        assert!(args.contains(&"Orientation=Landscape".to_string()));
        assert!(args.contains(&"StapleLocation=SinglePortrait".to_string()));
        assert!(!args.iter().any(|arg| arg.starts_with("Ignored=")));
        // Typed settings still resolve alongside driver options.
        assert!(args.contains(&"media=A4".to_string()));
    }

    #[test]
    fn presentation_booklet_bypasses_native_booklet_mode() {
        let mut settings = base_settings();
        settings.duplex = "PresentationBooklet".to_string();
        settings
            .driver_options
            .insert("Binding".to_string(), "LeftBinding".to_string());
        let mut options = DriverOptions::new();
        options.insert(
            "KMDuplex".to_string(),
            ParsedOption {
                keyword: "KMDuplex".to_string(),
                display_name: "Print Type".to_string(),
                choices: vec![CapabilityChoice {
                    value: "Booklet".to_string(),
                    label: "Booklet".to_string(),
                    is_default: false,
                }],
            },
        );
        options.insert(
            "Binding".to_string(),
            ParsedOption {
                keyword: "Binding".to_string(),
                display_name: "Binding Position".to_string(),
                choices: vec![
                    CapabilityChoice {
                        value: "LeftBinding".to_string(),
                        label: "Left Bind".to_string(),
                        is_default: true,
                    },
                    CapabilityChoice {
                        value: "TopBinding".to_string(),
                        label: "Top Bind".to_string(),
                        is_default: false,
                    },
                ],
            },
        );

        let args = build_print_options(&settings, &options);

        assert!(args.contains(&"sides=two-sided-short-edge".to_string()));
        assert!(args.contains(&"Binding=TopBinding".to_string()));
        assert!(!args.iter().any(|arg| arg == "KMDuplex=Booklet"));
        assert!(!args.iter().any(|arg| arg == "Binding=LeftBinding"));
    }

    #[test]
    fn presentation_booklet_does_not_emit_unsupported_top_binding() {
        let mut settings = base_settings();
        settings.duplex = "PresentationBooklet".to_string();

        let args = build_print_options(&settings, &DriverOptions::new());

        assert!(args.contains(&"sides=two-sided-short-edge".to_string()));
        assert!(!args.iter().any(|arg| arg.starts_with("Binding=")));
    }
}
