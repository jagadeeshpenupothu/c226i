use crate::parser::DriverOptions;

pub fn build_print_options(
    settings: &crate::models::PrintSettings,
    options: &DriverOptions,
) -> Vec<String> {
    let mut args = Vec::new();

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

    // Advanced driver options chosen in the "More Options" panel travel straight
    // through as CUPS `-o keyword=value` pairs. Their keywords are disjoint from
    // the typed settings above (the UI only records driver options whose keyword
    // is not one of the normalized capability keywords), so they never conflict.
    for (keyword, value) in &settings.driver_options {
        let keyword = keyword.trim();
        let value = value.trim();
        if keyword.is_empty() || value.is_empty() {
            continue;
        }
        args.push(format!("{keyword}={value}"));
    }

    args
}

fn map_duplex(value: &str, options: &DriverOptions) -> String {
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
    use crate::models::PrintSettings;
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
}
