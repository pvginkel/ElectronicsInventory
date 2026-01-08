# Field Normalization Rules

## product_name (Description)
**Canonical format**: `{Primary category} ({controller/series/model if applicable})`

**Rules**:
- Single human-friendly sentence that identifies and differentiates the part
- Start with canonical name; optionally include size if it distinguishes models
- NO marketing ("for Arduino"), seller names, color variants, exhaustive specs

**Examples**:
- `0.96-inch OLED display module (SSD1306)` ← from "0.96" 128x64 OLED I2C SSD1306 Yellow Blue For Arduino"
- `25 mm geared stepper motor (25BYJ-01)` ← from "25BYJ-01 PM stepper motor for radiator valves"
- `2×4 female pin header (2.54 mm)` ← from "2x4 2.54mm Dupont socket"
- `Buck converter module (LM2596)` ← from "DC-DC Step Down Buck Converter LM2596 4A Display"

## manufacturer
- Prefer **actual component manufacturer** (e.g., Sensirion, Infineon, Advanced Monolithic Systems)
- Use exactly `"Generic"` when unknown or for generic modules
- NEVER use sellers ("Ben's Electronics", "DFRobot") or marketplace brands

## manufacturer_part_number
- MPN or canonical part family root (e.g., SSD1306, AMS1117-3.3, IRLZ44N)
- For generic modules without MPNs: leave null

## product_family
- Family/series name (e.g., Arduino: Mega/Uno/Nano; ESP32-S/ESP32-C)

## product_category
- Exactly one from the list above
- If none fits: "Proposed: <name>"

## package_type
- Use JEDEC/EIA codes: DIP, SOIC, QFN-32, LQFP-48, SOT-23, TO-220, etc.
- For dev boards/modules: "Module"
- For through-hole: "Through-Hole"
- NEVER: "PCB", "PCBA", "Plugin", "PTH"

## mounting_type
Exactly one of: "Through-Hole", "Surface-Mount", "Panel Mount", "DIN Rail Mount"

## voltage_rating / input_voltage / output_voltage
- Use uppercase V with no space: `5V`, `3.3V`, `3.3–5V` (en dash for ranges)
- `voltage_rating`: Only for simple single-rail parts
- `input_voltage` / `output_voltage`: For converters, dev boards (no current/power specs)

## physical_dimensions
- Format: `{width} × {height} × {depth} mm` (multiplication symbol ×, spaces around it)
- Examples: `25 mm × 20 mm × 28 mm`, `120 mm × 90 mm PCB`
- Use when size distinguishes the part; omit when redundant

## tags
**Purpose**: Categorization, search, filtering (3-8 tags max, lowercase with hyphens)

**Allowed vocabulary**:
- **Function**: led, transistor, mosfet, diode, regulator, ldo, sensor, display, oled, microcontroller, converter, relay, connector, motor, stepper-motor, resistor, capacitor, buzzer, module, optocoupler
- **Technology**: buck, boost, linear, logic-level, geared, smd, tht, breakout, n-channel, p-channel, isolation
- **Interface** (NEVER in description): i2c, spi, uart, can, usb, gpio
- **Voltage** (high-level only): 3v3, 5v, 12v, 24v
- **Package**: dip-4, dip-8, dip-14, dip-16, dip-28, dip-40, sop8, soic8, soic16, tqfp48, qfn32, to-92, to-220

**Rules**:
- NO duplicates, NO quantitative values (resistance, capacitance, lengths)
- NO tolerances, NO overly specific details

# Noise Elimination
Always remove:
- Marketing language, seller names, product codes
- Repeated information across fields
- Unnecessary precision
- "for Arduino", "high quality", "premium", etc.

# Validation
- Tags: max 5 words each, lowercase with hyphens, no quantitative aspects
- If multiple variants match query, choose closest exact match
- If uncertain, bail out and return `analysis_failure_reason`

# Complete Examples

**Input**: "Ben's Electronics SKU KO70"
**Output**:
```json
{
   "product_name": "0.96-inch OLED display module (SSD1306, yellow/blue)",
   "product_family": "SSD1306",
   "product_category": "Display - OLED",
   "manufacturer": "Generic",
   "package_type": "Module",
   "mounting_type": "Through-Hole",
   "part_pin_count": 4,
   "input_voltage": "3V–5V",
   "tags": ["oled", "display", "i2c", "3v3", "5v", "module"]
}
```

**Input**: "IRLZ44N MOSFET Power Transistor"
**Output**:
```json
{
   "product_name": "Logic-level N-channel MOSFET (IRLZ44N)",
   "product_family": "IRLZ44",
   "product_category": "MOSFET",
   "manufacturer": "Infineon",
   "manufacturer_part_number": "IRLZ44N",
   "package_type": "TO-220",
   "mounting_type": "Through-Hole",
   "part_pin_count": 3,
   "voltage_rating": "55V",
   "tags": ["mosfet", "n-channel", "logic-level", "tht"]
}
```

**Input**: "HLK-PM24"
**Output**:
```json
{
  "product_name": "24V AC-DC power module (HLK-PM24)",
  "product_family": "HLK-PM",
  "product_category": "Power Module",
  "manufacturer": "Hi-Link",
  "manufacturer_part_number": "HLK-PM24",
  "package_type": "Module",
  "mounting_type": "Through-Hole",
  "part_pin_count": 4,
  "part_pin_pitch": "5.08 mm",
  "input_voltage": "100–240V AC",
  "output_voltage": "24V DC",
  "physical_dimensions": "34 × 20 × 15 mm",
  "tags": ["converter", "module", "24v"]
}
```

**Input**: "Sharp PC817"
**Output**:
```json
{
   "product_name": "Optocoupler, phototransistor output (PC817)",
   "product_family": "PC817",
   "product_category": "Optocoupler",
   "manufacturer": "Sharp",
   "manufacturer_part_number": "PC817",
   "package_type": "DIP-4",
   "mounting_type": "Through-Hole",
   "part_pin_count": 4,
   "part_pin_pitch": "2.54 mm",
   "tags": ["optocoupler", "dip-4", "tht", "isolation"]
}
```
