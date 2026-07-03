use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityChoice {
    pub value: String,
    pub label: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedOption {
    pub keyword: String,
    pub display_name: String,
    pub choices: Vec<CapabilityChoice>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PrinterStatus {
    Online,
    Offline,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub status: PrinterStatus,
    pub status_message: String,
}

pub type Tray = CapabilityChoice;
pub type PaperSize = CapabilityChoice;
pub type PaperType = CapabilityChoice;
pub type DuplexMode = CapabilityChoice;
pub type ColorMode = CapabilityChoice;
pub type Resolution = CapabilityChoice;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CapabilityCategory {
    Essential,
    Common,
    Advanced,
    Expert,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub enum CapabilityControlType {
    Dropdown,
    Toggle,
    Slider,
    Number,
    Text,
    Password,
    MultiSelect,
    ReadOnly,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub enum CapabilitySource {
    LpOptions,
    Ppd,
    Ipp,
    Cups,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverCapability {
    pub id: String,
    pub option: ParsedOption,
    pub category: CapabilityCategory,
    pub control_type: CapabilityControlType,
    pub source: CapabilitySource,
    pub priority: u16,
    pub safe: bool,
    pub writable: bool,
    pub hidden: bool,
    pub search_keywords: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterCapabilities {
    pub printer_id: String,
    pub trays: Vec<Tray>,
    pub paper_sizes: Vec<PaperSize>,
    pub paper_types: Vec<PaperType>,
    pub duplex_modes: Vec<DuplexMode>,
    pub color_modes: Vec<ColorMode>,
    pub resolutions: Vec<Resolution>,
    pub driver_capabilities: Vec<DriverCapability>,
}

impl PrinterCapabilities {
    pub fn new(
        printer_id: String,
        trays: Vec<Tray>,
        paper_sizes: Vec<PaperSize>,
        paper_types: Vec<PaperType>,
        duplex_modes: Vec<DuplexMode>,
        color_modes: Vec<ColorMode>,
        resolutions: Vec<Resolution>,
        options: Vec<ParsedOption>,
    ) -> Self {
        let driver_capabilities = options
            .into_iter()
            .enumerate()
            .map(|(index, option)| DriverCapability::from_option(option, index))
            .collect();

        Self {
            printer_id,
            trays,
            paper_sizes,
            paper_types,
            duplex_modes,
            color_modes,
            resolutions,
            driver_capabilities,
        }
    }
}

impl DriverCapability {
    fn from_option(option: ParsedOption, index: usize) -> Self {
        let category = classify_category(&option);
        let control_type = infer_control_type(&option);
        let priority = category_priority(&category).saturating_add(index as u16);
        let search_keywords = build_search_keywords(&option);

        Self {
            id: option.keyword.clone(),
            option,
            category,
            control_type,
            source: CapabilitySource::LpOptions,
            priority,
            safe: true,
            writable: true,
            hidden: false,
            search_keywords,
        }
    }
}

fn classify_category(option: &ParsedOption) -> CapabilityCategory {
    let text = searchable_text(option);

    if contains_any(
        &text,
        &[
            "icc",
            "colormatching",
            "halftone",
            "screening",
            "raster",
            "pdf",
            "postscript",
            "authentication",
            "secureprint",
        ],
    ) {
        CapabilityCategory::Expert
    } else if contains_any(&text, &["staple", "punch", "fold", "outputbin", "booklet"]) {
        CapabilityCategory::Advanced
    } else if contains_any(
        &text,
        &["resolution", "mediatype", "mediaweight", "quality"],
    ) {
        CapabilityCategory::Common
    } else if contains_any(&text, &["inputslot", "pagesize", "media", "tray", "copies"]) {
        CapabilityCategory::Essential
    } else {
        CapabilityCategory::Unknown
    }
}

fn infer_control_type(option: &ParsedOption) -> CapabilityControlType {
    if is_boolean_option(option) {
        CapabilityControlType::Toggle
    } else if is_numeric_option(option) {
        CapabilityControlType::Number
    } else {
        CapabilityControlType::Dropdown
    }
}

fn is_boolean_option(option: &ParsedOption) -> bool {
    option.choices.len() == 2
        && option.choices.iter().all(|choice| {
            let value = normalize_identifier(&choice.value);
            let label = normalize_identifier(&choice.label);

            is_boolean_word(&value) || is_boolean_word(&label)
        })
}

fn is_boolean_word(value: &str) -> bool {
    matches!(
        value,
        "true"
            | "false"
            | "yes"
            | "no"
            | "on"
            | "off"
            | "enable"
            | "disable"
            | "enabled"
            | "disabled"
    )
}

fn is_numeric_option(option: &ParsedOption) -> bool {
    let text = searchable_text(option);

    contains_any(
        &text,
        &[
            "copies",
            "copycount",
            "numcopies",
            "numberofcopies",
            "jobpriority",
        ],
    ) || (!option.choices.is_empty()
        && option
            .choices
            .iter()
            .all(|choice| choice.value.parse::<i64>().is_ok()))
}

fn category_priority(category: &CapabilityCategory) -> u16 {
    match category {
        CapabilityCategory::Essential => 100,
        CapabilityCategory::Common => 200,
        CapabilityCategory::Advanced => 300,
        CapabilityCategory::Expert => 400,
        CapabilityCategory::Unknown => 500,
    }
}

fn build_search_keywords(option: &ParsedOption) -> Vec<String> {
    let mut keywords = Vec::new();

    push_unique_keyword(&mut keywords, &option.keyword);
    push_unique_keyword(&mut keywords, &option.display_name);

    for choice in &option.choices {
        push_unique_keyword(&mut keywords, &choice.label);
    }

    keywords
}

fn push_unique_keyword(keywords: &mut Vec<String>, value: &str) {
    let keyword = normalize_search_term(value);

    if !keyword.is_empty() && !keywords.contains(&keyword) {
        keywords.push(keyword);
    }
}

fn searchable_text(option: &ParsedOption) -> String {
    format!(
        "{} {}",
        normalize_identifier(&option.keyword),
        normalize_identifier(&option.display_name)
    )
}

fn normalize_search_term(value: &str) -> String {
    value
        .replace(['-', '_'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn normalize_identifier(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn contains_any(text: &str, keywords: &[&str]) -> bool {
    keywords.iter().any(|keyword| text.contains(keyword))
}
