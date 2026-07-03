use crate::models::{PrinterInfo, PrinterStatus};
use std::collections::BTreeMap;

pub fn parse_printers(
    status_output: &str,
    device_output: &str,
    default_printer: Option<&str>,
) -> Vec<PrinterInfo> {
    let mut printers = status_output
        .lines()
        .filter_map(|line| parse_printer_line(line, default_printer))
        .map(|printer| (printer.id.clone(), printer))
        .collect::<BTreeMap<_, _>>();

    for name in parse_device_names(device_output) {
        let is_default = default_printer == Some(name.as_str());
        printers.entry(name.clone()).or_insert_with(|| PrinterInfo {
            id: name.clone(),
            name,
            is_default,
            status: PrinterStatus::Unknown,
            status_message: "Unknown".to_string(),
        });
    }

    printers.into_values().collect()
}

fn parse_printer_line(line: &str, default_printer: Option<&str>) -> Option<PrinterInfo> {
    if !line.starts_with("printer ") {
        return None;
    }

    let name = line.split_whitespace().nth(1)?;
    let normalized = line.to_lowercase();
    let status = if normalized.contains("disabled")
        || normalized.contains("offline")
        || normalized.contains("not connected")
        || normalized.contains("unable")
    {
        PrinterStatus::Offline
    } else if normalized.contains("enabled")
        || normalized.contains("idle")
        || normalized.contains("printing")
    {
        PrinterStatus::Online
    } else {
        PrinterStatus::Unknown
    };

    let status_message = match status {
        PrinterStatus::Online => "Online",
        PrinterStatus::Offline => "Offline",
        PrinterStatus::Unknown => "Unknown",
    }
    .to_string();

    Some(PrinterInfo {
        id: name.to_string(),
        name: name.to_string(),
        is_default: default_printer == Some(name),
        status,
        status_message,
    })
}

fn parse_device_names(output: &str) -> Vec<String> {
    output
        .lines()
        .filter_map(|line| {
            let rest = line.strip_prefix("device for ")?;
            rest.split(':')
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty())
        })
        .map(ToOwned::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::parse_printers;

    #[test]
    fn merges_status_and_device_printers() {
        let status_output = "\
printer Brother_DCP_T820DW is idle.  enabled since Mon Jun 22 17:45:13 2026
printer EPSON_L3150_Series disabled since Wed Jun 17 18:00:19 2026
";
        let device_output = "\
device for Brother_DCP_T820DW: ippusb://Brother
device for EPSON_L3150_Series: usb://EPSON
device for KonicaC226i: ipp://10.10.0.25/ipp
";

        let printers = parse_printers(status_output, device_output, Some("Brother_DCP_T820DW"));

        assert_eq!(printers.len(), 3);
        assert!(printers.iter().any(|printer| printer.id == "KonicaC226i"));
        assert!(printers
            .iter()
            .any(|printer| printer.id == "Brother_DCP_T820DW" && printer.is_default));
        assert!(printers.iter().any(
            |printer| printer.id == "EPSON_L3150_Series" && printer.status_message == "Offline"
        ));
    }
}
