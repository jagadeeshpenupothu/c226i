use crate::models::{CapabilityChoice, ParsedOption};
use std::collections::HashMap;

pub type DriverOptions = HashMap<String, ParsedOption>;

pub fn parse_lpoptions(output: &str) -> DriverOptions {
    let mut options = DriverOptions::new();

    for line in output.lines().filter(|line| !line.trim().is_empty()) {
        let Some((name_part, choices_part)) = line.split_once(':') else {
            continue;
        };

        let mut names = name_part.splitn(2, '/');
        let keyword = names.next().unwrap_or_default().trim();
        if keyword.is_empty() {
            continue;
        }

        let display_name = names.next().unwrap_or(keyword).trim();
        let choices = choices_part
            .split_whitespace()
            .filter_map(parse_choice)
            .collect::<Vec<_>>();

        options.insert(
            keyword.to_string(),
            ParsedOption {
                keyword: keyword.to_string(),
                display_name: display_name.to_string(),
                choices,
            },
        );
    }

    options
}

fn parse_choice(raw: &str) -> Option<CapabilityChoice> {
    let value = raw.trim();
    if value.is_empty() {
        return None;
    }

    let is_default = value.starts_with('*');
    let value = value.trim_start_matches('*');
    let label = value
        .split_once('/')
        .map(|(_, display)| display)
        .unwrap_or(value)
        .replace('_', " ");
    let value = value
        .split_once('/')
        .map(|(keyword, _)| keyword)
        .unwrap_or(value);

    Some(CapabilityChoice {
        value: value.to_string(),
        label,
        is_default,
    })
}

#[cfg(test)]
mod tests {
    use super::parse_lpoptions;

    #[test]
    fn parses_driver_options_and_defaults() {
        let output = "\
ColorModel/Color Mode: Gray *RGB
Duplex/2-Sided Printing: None *DuplexNoTumble DuplexTumble
PageSize/Media Size: Legal Letter *A4 Custom.WIDTHxHEIGHT
MediaType/MediaType: stationery photographic-glossy *any
InputSlot/Media Source: auto by-pass-tray tray-1
";

        let options = parse_lpoptions(output);

        let color = options.get("ColorModel").expect("color option");
        assert_eq!(color.display_name, "Color Mode");
        assert_eq!(color.choices[1].value, "RGB");
        assert!(color.choices[1].is_default);

        let page_size = options.get("PageSize").expect("page size option");
        assert_eq!(page_size.choices[2].value, "A4");
        assert_eq!(page_size.choices[3].value, "Custom.WIDTHxHEIGHT");

        let input_slot = options.get("InputSlot").expect("input slot option");
        assert_eq!(input_slot.choices.len(), 3);
        assert_eq!(input_slot.choices[1].value, "by-pass-tray");
    }
}
