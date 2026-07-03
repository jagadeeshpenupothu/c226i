use crate::models::{CapabilityChoice, ParsedOption, PrinterCapabilities};
use crate::parser::DriverOptions;

pub fn build_capabilities(printer_id: &str, options: &DriverOptions) -> PrinterCapabilities {
    let trays = collect_choices(
        options,
        &["KMInputSlot", "InputSlot", "APInputSlot", "PaperSources"],
    );
    let paper_sizes = collect_choices(options, &["PageSize", "media", "MediaSize"]);
    let paper_types = collect_choices(options, &["MediaType", "KMMediaType", "MediaWeight"]);
    let duplex_modes = collect_choices(options, &["KMDuplex", "sides", "Duplex", "EFDuplex"]);
    let color_modes = collect_choices(
        options,
        &["SelectColor", "ColorModel", "ColorMode", "BRColorMode"],
    );
    let resolutions = collect_choices(
        options,
        &[
            "Resolution",
            "printer-resolution",
            "CNResolution",
            "cupsPrintQuality",
        ],
    );

    log_capabilities(printer_id, &trays, &paper_types, !duplex_modes.is_empty());

    let mut driver_options = options.values().cloned().collect::<Vec<_>>();
    driver_options.sort_by(|left, right| left.keyword.cmp(&right.keyword));

    PrinterCapabilities::new(
        printer_id.to_string(),
        trays,
        paper_sizes,
        paper_types,
        duplex_modes,
        color_modes,
        resolutions,
        driver_options,
    )
}

fn collect_choices(options: &DriverOptions, option_names: &[&str]) -> Vec<CapabilityChoice> {
    option_names
        .iter()
        .find_map(|name| options.get(*name))
        .map(|option| normalize_choices(option))
        .unwrap_or_default()
}

fn normalize_choices(option: &ParsedOption) -> Vec<CapabilityChoice> {
    option
        .choices
        .iter()
        .map(|choice| CapabilityChoice {
            value: choice.value.clone(),
            label: friendly_label(&choice.label),
            is_default: choice.is_default,
        })
        .collect()
}

fn friendly_label(label: &str) -> String {
    let compact = label.replace('-', " ").replace('_', " ");
    let lower = compact.to_lowercase();

    if lower == "one sided" || lower == "none" {
        return "Single".to_string();
    }
    if lower.contains("two sided") || lower.contains("duplex") {
        return "Double".to_string();
    }
    if lower.contains("gray") || lower.contains("grey") || lower.contains("mono") {
        return "Grayscale".to_string();
    }
    if lower.contains("rgb") || lower.contains("cmyk") || lower == "color" {
        return "Color".to_string();
    }
    if lower.contains("auto") || lower == "default" {
        return "Auto".to_string();
    }

    compact
        .split_whitespace()
        .map(|part| {
            if part.chars().all(|ch| ch.is_ascii_digit()) {
                part.to_string()
            } else {
                let mut chars = part.chars();
                match chars.next() {
                    Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                    None => String::new(),
                }
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn log_capabilities(
    printer_id: &str,
    trays: &[CapabilityChoice],
    paper_types: &[CapabilityChoice],
    duplex_supported: bool,
) {
    println!("Capabilities loaded");
    println!("Printer: {printer_id}");
    println!("Tray count: {}", trays.len());
    println!("Media types: {}", paper_types.len());
    println!("Duplex supported: {duplex_supported}");
}

#[cfg(test)]
mod tests {
    use super::build_capabilities;
    use crate::parser::parse_lpoptions;

    #[test]
    fn builds_konica_style_capability_groups() {
        let output = "\
KMInputSlot/Paper Tray: *Auto Tray1 Tray2 Tray3 Tray4 BypassTray
MediaType/Paper Type: *Plain Thick1 Thick1Plus Thick2 Thick3 Envelope Transparency
KMDuplex/Print Type: Single *Double Booklet
SelectColor/Select Color: *Color Grayscale
Resolution/Resolution: *600dpi 1200dpi
PageSize/Paper Size: *A4JIS A3JIS A5JIS 8.5x11 Custom.WIDTHxHEIGHT
";

        let parsed = parse_lpoptions(output);
        let capabilities = build_capabilities("KonicaC226i", &parsed);

        assert_eq!(capabilities.trays.len(), 6);
        assert_eq!(capabilities.paper_types.len(), 7);
        assert_eq!(capabilities.duplex_modes.len(), 3);
        assert_eq!(capabilities.color_modes.len(), 2);
        assert_eq!(capabilities.resolutions.len(), 2);
        assert_eq!(capabilities.driver_capabilities.len(), 6);
    }

    #[test]
    fn preserves_every_parsed_option_as_driver_capability() {
        let output = "\
InputSlot/Paper Tray: *Auto Tray1
Staple/Staple: *None TopLeft
SecurePrint/Secure Print: *False True
Copies/Copies: 1 2 3
VendorMagic/Vendor Magic: *Default Fancy
";

        let parsed = parse_lpoptions(output);
        let capabilities = build_capabilities("OfficePrinter", &parsed);

        assert_eq!(capabilities.driver_capabilities.len(), parsed.len());

        for option in parsed.values() {
            let matching = capabilities
                .driver_capabilities
                .iter()
                .filter(|capability| capability.option.keyword == option.keyword)
                .count();

            assert_eq!(matching, 1, "{} should be preserved once", option.keyword);
        }
    }

    #[test]
    fn generates_driver_capability_search_keywords() {
        let output = "\
MediaType/Paper Type: *Plain Thick_Stock Plain
";

        let parsed = parse_lpoptions(output);
        let capabilities = build_capabilities("OfficePrinter", &parsed);
        let capability = capabilities
            .driver_capabilities
            .iter()
            .find(|capability| capability.id == "MediaType")
            .expect("media type capability");

        assert_eq!(
            capability.search_keywords,
            vec!["mediatype", "paper type", "plain", "thick stock"]
        );
    }
}
